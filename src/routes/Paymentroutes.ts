import { Router } from "express";
import { protect } from "../middleware/auth"; 
import { createRazorpayOrder, verifyRazorpayPayment } from "../controllers/Paymentcontroller";

const router = Router();

router.post("/razorpay/order", protect, createRazorpayOrder);
router.post("/razorpay/verify", protect, verifyRazorpayPayment);

export default router;