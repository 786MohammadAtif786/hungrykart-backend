import { Router } from "express";
import {
  getProducts,
  getProductById,
  getAllProductsAdmin,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/productController";
import { protect, authorize } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { validateObjectId } from "../middleware/validateObjectId";
import { createProductSchema, updateProductSchema } from "../validators/productValidator";
import { Role } from "../models/User";

const router = Router();

router.get("/", getProducts);

router.get("/admin/all", protect, authorize(Role.ADMIN), getAllProductsAdmin);

router.post(
  "/",
  protect,
  authorize(Role.ADMIN),
  upload.single("image"),
  validate(createProductSchema),
  createProduct
);

router.get("/:id", validateObjectId(), getProductById);

router.put(
  "/:id",
  protect,
  authorize(Role.ADMIN),
  validateObjectId(),
  upload.single("image"),
  validate(updateProductSchema),
  updateProduct
);

router.delete("/:id", protect, authorize(Role.ADMIN), validateObjectId(), deleteProduct);

export default router;
