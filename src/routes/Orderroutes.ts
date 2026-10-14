import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  createOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  cancelMyOrder,
} from "../controllers/Ordercontroller";
import { Role } from "../models/User";

const router = Router();

router.post("/", protect, createOrder);
router.get("/my-orders", protect, getMyOrders);

// admin routes "/:id" se PEHLE
router.get("/admin/all", protect, authorize(Role.ADMIN), getAllOrders);
router.patch("/admin/:id/status", protect, authorize(Role.ADMIN), updateOrderStatus);

router.patch("/:id/cancel", protect, cancelMyOrder); // NEW
router.get("/:id", protect, getOrderById);

export default router;