import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import { Role } from "../models/User";
import {
  getAvailable,
  getMine,
  acceptOrder,
  outForDelivery,
  markDelivered,
} from "../controllers/Deliverycontroller";

const router = Router();

router.use(protect, authorize(Role.DELIVERY_PARTNER));

router.get("/available", getAvailable);
router.get("/mine", getMine);
router.patch("/:id/accept", acceptOrder);
router.patch("/:id/out-for-delivery", outForDelivery);
router.patch("/:id/delivered", markDelivered);

export default router;