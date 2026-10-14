import crypto from "crypto";
import type { RequestHandler } from "express";
import type { FilterQuery, HydratedDocument } from "mongoose";
import Order, {
  ORDER_STATUSES,
  type IOrder,
  type IDeliveryDetails,
  type OrderStatus,
  type PaymentMethod,
} from "../models/Order";
import Payment from "../models/Payment";
import { Role } from "../models/User";
import { buildOrderDraft, HttpError, isObjectId } from "../models/pricing";
import { AuthRequest } from "../middleware/auth";
import { getIO } from "../socket";

interface CreateOrderBody {
  items?: unknown;
  deliveryDetails?: Partial<IDeliveryDetails>;
  paymentMethod?: PaymentMethod;
  paymentId?: string;
  razorpayOrderId?: string;
}

const isStatus = (s: unknown): s is OrderStatus => ORDER_STATUSES.includes(s as OrderStatus);

const makeOrderNumber = () =>
  "HK" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();

/**
 * ADMIN ke allowed transitions:
 * PLACED -> CONFIRMED -> PREPARING -> READY
 * READY ke baad OUT_FOR_DELIVERY / DELIVERED delivery partner karta hai
 * (OUT_FOR_DELIVERY -> DELIVERED admin override ke liye rakha hai).
 * OUT_FOR_DELIVERY ke baad cancel nahi ho sakta.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["CANCELLED"], // OUT_FOR_DELIVERY rider karega
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

// Customer sirf tab cancel kar sakta hai jab kitchen ne banana shuru nahi kiya
const CUSTOMER_CANCELLABLE: OrderStatus[] = ["PLACED", "CONFIRMED"];

// Date filter ka timezone (default IST = +330 min)
const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MIN ?? 330);

/* ------------------------------ helpers ------------------------------ */

/** Socket emit kabhi bhi API response ko tod na sake */
export function emitSafe(fn: (io: NonNullable<ReturnType<typeof getIO>>) => void) {
  try {
    const io = getIO();
    if (io) fn(io);
  } catch (e) {
    console.error("[socket] emit failed:", e);
  }
}

const riderIdOf = (o: HydratedDocument<IOrder>) =>
  o.deliveryBoy ? String((o.deliveryBoy as any)._id ?? o.deliveryBoy) : undefined;

export const statusPayload = (o: HydratedDocument<IOrder>) => {
  const rider: any = o.deliveryBoy && (o.deliveryBoy as any).name ? o.deliveryBoy : null;
  return {
    orderId: String(o._id),
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    updatedAt: o.updatedAt.toISOString(),
    deliveryBoy: rider ? { _id: String(rider._id), name: rider.name, phone: rider.phone } : null,
    ...(o.cancelReason ? { cancelReason: o.cancelReason } : {}),
  };
};

/**
 * orderUpdated / orderCancelled -> admins + customer + (assigned rider).
 * READY order cancel ho jaye aur rider assign na ho to saare riders ko bhi jata hai.
 */
export async function broadcastStatus(order: HydratedDocument<IOrder>) {
  try {
    await order.populate("deliveryBoy", "name phone");
  } catch (e) {
    console.error("[socket] rider populate failed:", e);
  }

  const event = order.status === "CANCELLED" ? "orderCancelled" : "orderUpdated";
  const payload = statusPayload(order);

  const rooms = ["admins", `user:${String(order.user)}`];
  const rider = riderIdOf(order);
  if (rider) rooms.push(`user:${rider}`);
  if (order.status === "CANCELLED" && !rider) rooms.push("delivery_partners");

  emitSafe((io) => {
    io.to(rooms).emit(event, payload);
  });
}

const cleanReason = (v: unknown): string | undefined => {
  const r = String(v ?? "").trim().slice(0, 200);
  return r || undefined;
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "YYYY-MM-DD" (TZ_OFFSET_MIN ke hisaab se) -> [start, end) UTC range */
function dayRange(dateStr: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d) - TZ_OFFSET_MIN * 60_000);
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

function todayRange() {
  const local = new Date(Date.now() + TZ_OFFSET_MIN * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return dayRange(`${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`)!;
}

function validateDelivery(d: Partial<IDeliveryDetails> = {}): IDeliveryDetails {
  const fullName = String(d.fullName ?? "").trim();
  const phone = String(d.phone ?? "");
  const address = String(d.address ?? "").trim();
  const landmark = String(d.landmark ?? "").trim().slice(0, 120);
  if (fullName.length < 2) throw new HttpError(400, "Enter your full name");
  if (!/^[6-9]\d{9}$/.test(phone)) throw new HttpError(400, "Enter a valid 10-digit mobile number");
  if (address.length < 10) throw new HttpError(400, "Enter your full address");
  return { fullName, phone, address, landmark };
}

/* ------------------------------ handlers ------------------------------ */

// POST /api/orders
export const createOrder: RequestHandler = async (req: AuthRequest, res, next) => {
  let claimedPayment: HydratedDocument<any> | null = null;
  try {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const { items, deliveryDetails, paymentMethod, paymentId, razorpayOrderId } = (req.body ?? {}) as CreateOrderBody;
    if (paymentMethod !== "COD" && paymentMethod !== "ONLINE") throw new HttpError(400, "Invalid payment method");

    const delivery = validateDelivery(deliveryDetails);
    const draft = await buildOrderDraft(items);

    let paymentStatus: IOrder["paymentStatus"] = "PENDING";
    if (paymentMethod === "ONLINE") {
      if (!paymentId || !razorpayOrderId) throw new HttpError(400, "Payment details missing");

      // VERIFIED -> USED atomically: ek payment se ek hi order
      claimedPayment = await Payment.findOneAndUpdate(
        {
          razorpayOrderId,
          razorpayPaymentId: paymentId,
          user: req.user.id,
          status: "VERIFIED",
          amountPaise: draft.totalPaise,
        },
        { status: "USED" },
        { new: true }
      );
      if (!claimedPayment) throw new HttpError(400, "Payment not verified or amount mismatch");
      paymentStatus = "PAID";
    }

    const order = await Order.create({
      orderNumber: makeOrderNumber(),
      user: req.user.id,
      items: draft.lines,
      deliveryDetails: delivery,
      subtotal: draft.subtotal,
      deliveryFee: draft.deliveryFee,
      tax: draft.tax,
      total: draft.total,
      paymentMethod,
      paymentStatus,
      ...(paymentMethod === "ONLINE" ? { razorpayOrderId, paymentId } : {}),
    });

    // Order DB me save ho chuka hai: ab payment rollback ki zarurat nahi
    claimedPayment = null;

    // ---- SOCKET: sirf DB save ke BAAD ----
    emitSafe((io) => {
      io.to(`user:${String(order.user)}`).emit("orderCreated", order);

      Order.findById(order._id)
        .populate("user", "name email")
        .then((full) => {
          if (full) io.to("admins").emit("newOrder", full);
        })
        .catch((e) => console.error("[socket] newOrder populate failed:", e));
    });

    res.status(201).json(order);
  } catch (err) {
    if (claimedPayment) {
      await Payment.updateOne({ _id: claimedPayment._id }, { status: "VERIFIED" }).catch(() => undefined);
    }
    next(err);
  }
};

// GET /api/orders/my-orders
export const getMyOrders: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const orders = await Order.find({ user: req.user.id })
      .populate("deliveryBoy", "name phone")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    next(err);
  }
};

// GET /api/orders/:id  (owner, admin ya assigned rider)
export const getOrderById: RequestHandler<{ id: string }> = async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    if (!isObjectId(req.params.id)) throw new HttpError(404, "Order not found");

    const order = await Order.findById(req.params.id);
    if (!order) throw new HttpError(404, "Order not found");

    const isOwner = String(order.user) === String(req.user.id);
    const isAdmin = req.user.role === Role.ADMIN;
    const isAssignedRider = !!order.deliveryBoy && String(order.deliveryBoy) === String(req.user.id);
    if (!isOwner && !isAdmin && !isAssignedRider) throw new HttpError(403, "Not allowed");

    await order.populate([
      { path: "user", select: "name email" },
      { path: "deliveryBoy", select: "name phone" },
    ]);
    res.json(order);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/orders/:id/cancel   body: { reason? }   (customer, sirf apna order)
export const cancelMyOrder: RequestHandler<{ id: string }> = async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    if (!isObjectId(req.params.id)) throw new HttpError(404, "Order not found");

    const existing = await Order.findById(req.params.id).select("user status");
    if (!existing || String(existing.user) !== String(req.user.id)) throw new HttpError(404, "Order not found");

    if (!CUSTOMER_CANCELLABLE.includes(existing.status)) {
      throw new HttpError(400, "Ab ye order cancel nahi ho sakta, kitchen me ban raha hai ya nikal chuka hai");
    }

    const reason = cleanReason(req.body?.reason);
    const order = await Order.findOneAndUpdate(
      { _id: existing._id, user: req.user.id, status: { $in: CUSTOMER_CANCELLABLE } },
      { $set: { status: "CANCELLED", cancelledBy: "CUSTOMER", ...(reason ? { cancelReason: reason } : {}) } },
      { new: true }
    );
    if (!order) throw new HttpError(409, "Order status abhi badal gaya, refresh karo");


    await broadcastStatus(order);
    res.json(order);
  } catch (err) {
    next(err);
  }
};


export const getAllOrders: RequestHandler = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));

    const base: FilterQuery<IOrder> = {};

    const q = String(req.query.q ?? "").trim().slice(0, 60);
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      base.$or = [{ orderNumber: rx }, { "deliveryDetails.fullName": rx }, { "deliveryDetails.phone": rx }];
    }

    const range = typeof req.query.date === "string" ? dayRange(req.query.date) : null;
    if (range) base.createdAt = { $gte: range.start, $lt: range.end };

    const filter: FilterQuery<IOrder> = isStatus(req.query.status) ? { ...base, status: req.query.status } : base;
    const today = todayRange();

    const [orders, total, grouped, deliveredToday] = await Promise.all([
      Order.find(filter)
        .populate("user", "name email")
        .populate("deliveryBoy", "name phone")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Order.countDocuments(filter),
      Order.aggregate<{ _id: OrderStatus; n: number }>([
        { $match: base },
        { $group: { _id: "$status", n: { $sum: 1 } } },
      ]),
      Order.countDocuments({ status: "DELIVERED", updatedAt: { $gte: today.start, $lt: today.end } }),
    ]);

    const counts: Record<string, number> = { ALL: 0 };
    for (const g of grouped) {
      counts[g._id] = g.n;
      counts.ALL += g.n;
    }

    res.json({ orders, total, page, pages: Math.ceil(total / limit), counts, deliveredToday });
  } catch (err) {
    next(err);
  }
};

export const updateOrderStatus: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const status: unknown = req.body?.status;
    if (!isStatus(status)) throw new HttpError(400, "Invalid status");
    if (!isObjectId(req.params.id)) throw new HttpError(404, "Order not found");

    const current = await Order.findById(req.params.id);
    if (!current) throw new HttpError(404, "Order not found");
    if (current.status === "DELIVERED" || current.status === "CANCELLED") {
      throw new HttpError(400, `Order already ${current.status.toLowerCase()}`);
    }

    if (!ALLOWED_TRANSITIONS[current.status].includes(status)) {
      throw new HttpError(400, `Cannot change status from ${current.status} to ${status}`);
    }

    const set: Record<string, unknown> = { status };
    if (status === "CANCELLED") {
      set.cancelledBy = "ADMIN";
      const reason = cleanReason(req.body?.reason);
      if (reason) set.cancelReason = reason;
    
    }
    if (status === "DELIVERED") {
      set.deliveredAt = new Date();
      if (current.paymentMethod === "COD") set.paymentStatus = "PAID";
    }

    const order = await Order.findOneAndUpdate(
      { _id: current._id, status: current.status },
      { $set: set },
      { new: true }
    );
    if (!order) throw new HttpError(409, "Order already updated, refresh karo");

    await broadcastStatus(order);

    if (order.status === "READY") {
      emitSafe((io) => {
        io.to("delivery_partners").emit("orderReady", order);
      });
    }

    res.json(order);
  } catch (err) {
    next(err);
  }
};