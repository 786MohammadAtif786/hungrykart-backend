import crypto from "crypto";
import Razorpay from "razorpay";
import type { RequestHandler } from "express";
import Payment from "../models/Payment";
import { buildOrderDraft, HttpError } from "../models/pricing";
import { AuthRequest } from "../middleware/auth";

// ─────────────────────────────────────────────
// Lazy Razorpay instance — env load ke BAAD banega
// ─────────────────────────────────────────────
let razorpayInstance: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (razorpayInstance) return razorpayInstance;

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new HttpError(500, "Razorpay keys are not configured in .env");
  }

  razorpayInstance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return razorpayInstance;
}

interface VerifyBody {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
}

// POST /api/payments/razorpay/order   body: { items: [{ productId, quantity }] }
export const createRazorpayOrder: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const draft = await buildOrderDraft(req.body?.items);

    const rzpOrder = await getRazorpay().orders.create({
      amount: draft.totalPaise,
      currency: "INR",
      receipt: `hk_${Date.now()}`,
      notes: { userId: String(req.user.id) },
    });

    await Payment.create({
      user: req.user.id,
      razorpayOrderId: rzpOrder.id,
      amountPaise: draft.totalPaise,
    });

    res.status(201).json({
      id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID, 
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/payments/razorpay/verify
export const verifyRazorpayPayment: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      (req.body ?? {}) as VerifyBody;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new HttpError(400, "Missing payment details");
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) throw new HttpError(500, "Razorpay key secret is not configured");

    // Razorpay ka official signature format: order_id|payment_id
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const expectedBuf = Buffer.from(expected, "utf8");
    const receivedBuf = Buffer.from(String(razorpay_signature), "utf8");

    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new HttpError(400, "Payment verification failed");
    }

    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id, user: req.user.id, status: "CREATED" },
      { status: "VERIFIED", razorpayPaymentId: razorpay_payment_id },
      { new: true }
    );

    if (!payment) throw new HttpError(400, "Payment not found or already verified");

    res.json({ verified: true });
  } catch (err) {
    next(err);
  }
};