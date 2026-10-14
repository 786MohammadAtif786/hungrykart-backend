
import type { Types } from "mongoose";
import {Product} from "../models/Product"; 
import type { IOrderItem } from "../models/Order";

const DELIVERY_FEE = 40;
const FREE_DELIVERY_ABOVE = 1000;
const GST_RATE = 0.05;
const MAX_QTY_PER_ITEM = 20;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface CartItemInput {
  productId: string;
  quantity: number;
}

export interface OrderDraft {
  lines: IOrderItem[];
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
  totalPaise: number;
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
export const isObjectId = (id: unknown): id is string => typeof id === "string" && OBJECT_ID.test(id);

export async function buildOrderDraft(items: unknown): Promise<OrderDraft> {
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, "Cart is empty");

  const qtyById = new Map<string, number>();
  for (const raw of items as Partial<CartItemInput>[]) {
    const qty = Number(raw?.quantity);
    if (!isObjectId(raw?.productId) || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) {
      throw new HttpError(400, "Invalid cart item");
    }
    qtyById.set(raw.productId, (qtyById.get(raw.productId) ?? 0) + qty);
  }

  const ids = [...qtyById.keys()];
  const products = await Product.find({ _id: { $in: ids } });
  if (products.length !== ids.length) throw new HttpError(400, "Some products no longer exist");

  const lines: IOrderItem[] = products.map((p) => {
    if (p.isAvailable === false) throw new HttpError(400, `${p.name} is currently unavailable`);
    return {
      product: p._id as Types.ObjectId,
      name: p.name,
      price: p.price,
      quantity: qtyById.get(String(p._id)) as number,
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const deliveryFee = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  const tax = Math.round(subtotal * GST_RATE);
  const total = subtotal + deliveryFee + tax;

  return { lines, subtotal, deliveryFee, tax, total, totalPaise: Math.round(total * 100) };
}