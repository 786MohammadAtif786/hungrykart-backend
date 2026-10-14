import { Schema, model, type Types } from "mongoose";

export const ORDER_STATUSES = [
  "PLACED",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentMethod = "COD" | "ONLINE";
export type PaymentStatus = "PENDING" | "PAID";
export type CancelledBy = "ADMIN" | "CUSTOMER";

export interface IOrderItem {
  product: Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
}

export interface IDeliveryDetails {
  fullName: string;
  phone: string;
  address: string;
  landmark: string;
}

export interface IOrder {
  orderNumber: string;
  user: Types.ObjectId;
  items: IOrderItem[];
  deliveryDetails: IDeliveryDetails;
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  razorpayOrderId?: string;
  paymentId?: string;
  status: OrderStatus;
  cancelReason?: string;
  cancelledBy?: CancelledBy;
  deliveryBoy?: Types.ObjectId; // NEW: jisne accept kiya
  assignedAt?: Date; // NEW
  deliveredAt?: Date; // NEW
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true }, // snapshot: product badle to bhi order sahi rahe
    price: { type: Number, required: true }, // snapshot (rupees)
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    deliveryDetails: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      landmark: { type: String, default: "" },
    },
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, required: true },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },

    paymentMethod: { type: String, enum: ["COD", "ONLINE"], required: true },
    paymentStatus: { type: String, enum: ["PENDING", "PAID"], default: "PENDING" },
    razorpayOrderId: { type: String },
    paymentId: { type: String },

    status: { type: String, enum: ORDER_STATUSES, default: "PLACED", index: true },
    cancelReason: { type: String, maxlength: 200 },
    cancelledBy: { type: String, enum: ["ADMIN", "CUSTOMER"] },

    // NEW: delivery
    deliveryBoy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    assignedAt: { type: Date },
    deliveredAt: { type: Date },
  },
  { timestamps: true }
);

// Ek payment se sirf ek order (replay attack rokta hai)
orderSchema.index({ paymentId: 1 }, { unique: true, sparse: true });
// Admin list: newest first
orderSchema.index({ createdAt: -1 });

const Order = model<IOrder>("Order", orderSchema);
export default Order;