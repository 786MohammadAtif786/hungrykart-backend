import type { RequestHandler } from "express";
import Order from "../models/Order";
import { HttpError, isObjectId } from "../models/pricing";
import { AuthRequest } from "../middleware/auth";
import { broadcastStatus, emitSafe } from "./Ordercontroller";

export const getAvailable: RequestHandler = async (_req, res, next) => {
  try {
    const orders = await Order.find({ status: "READY", deliveryBoy: { $exists: false } }).sort({ updatedAt: 1 });
    res.json(orders);
  } catch (e) {
    next(e);
  }
};

export const getMine: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const orders = await Order.find({
      deliveryBoy: req.user.id,
      status: { $in: ["READY", "OUT_FOR_DELIVERY", "DELIVERED"] },
    })
      .populate("deliveryBoy", "name phone")
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json(orders);
  } catch (e) {
    next(e);
  }
};

export const acceptOrder: RequestHandler<{ id: string }> = async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    if (!isObjectId(req.params.id)) throw new HttpError(404, "Order not found");

    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: "READY", deliveryBoy: { $exists: false } },
      { $set: { deliveryBoy: req.user.id, assignedAt: new Date() } },
      { new: true }
    );
    if (!order) throw new HttpError(409, "Order already taken ya available nahi hai");

    emitSafe((io) => {
      io.to("delivery_partners").emit("orderTaken", { orderId: String(order._id) });
    });

    await broadcastStatus(order);
    res.json(order);
  } catch (e) {
    next(e);
  }
};

export const outForDelivery: RequestHandler<{ id: string }> = async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    if (!isObjectId(req.params.id)) throw new HttpError(404, "Order not found");

    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, deliveryBoy: req.user.id, status: "READY" },
      { $set: { status: "OUT_FOR_DELIVERY" } },
      { new: true }
    );
    if (!order) throw new HttpError(400, "Order out for delivery nahi ho sakta");

    await broadcastStatus(order);
    res.json(order);
  } catch (e) {
    next(e);
  }
};

export const markDelivered: RequestHandler<{ id: string }> = async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    if (!isObjectId(req.params.id)) throw new HttpError(404, "Order not found");

    const existing = await Order.findOne({
      _id: req.params.id,
      deliveryBoy: req.user.id,
      status: "OUT_FOR_DELIVERY",
    }).select("paymentMethod");
    if (!existing) throw new HttpError(400, "Order deliver nahi ho sakta");

    const set: Record<string, unknown> = { status: "DELIVERED", deliveredAt: new Date() };
    if (existing.paymentMethod === "COD") set.paymentStatus = "PAID"; // cash mil gaya

    const order = await Order.findOneAndUpdate(
      { _id: existing._id, deliveryBoy: req.user.id, status: "OUT_FOR_DELIVERY" },
      { $set: set },
      { new: true }
    );
    if (!order) throw new HttpError(409, "Order status badal chuka hai, refresh karo");

    await broadcastStatus(order);
    res.json(order);
  } catch (e) {
    next(e);
  }
};