import { Schema, model, type Types } from "mongoose";

export type PaymentRecordStatus = "CREATED" | "VERIFIED" | "USED";

export interface IPayment {
  user: Types.ObjectId;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  amountPaise: number;
  status: PaymentRecordStatus;
}

const paymentSchema = new Schema<IPayment>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String },
    amountPaise: { type: Number, required: true },
    status: { type: String, enum: ["CREATED", "VERIFIED", "USED"], default: "CREATED" },
  },
  { timestamps: true }
);

const Payment = model<IPayment>("Payment", paymentSchema);
export default Payment;