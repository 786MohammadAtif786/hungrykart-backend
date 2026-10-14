import { Request, Response } from "express";
import { Product, PRODUCT_TAGS, type ProductTag  } from "../models/Product";
import { AuthRequest } from "../middleware/auth";
import { uploadBuffer, deleteImage } from "../config/cloudinary";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- PUBLIC (frontend pe dikhne wale) ----------

// GET /api/products?category=pizza&foodType=veg&tag=spicy&search=cheese&page=1&limit=12
export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(parseInt(String(req.query.page)) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 12, 1), 50);

    const filter: Record<string, any> = { isAvailable: true };
    if (req.query.category) filter.category = String(req.query.category).toLowerCase().trim();
    if (req.query.foodType) filter.foodType = String(req.query.foodType).toLowerCase().trim();
    if (req.query.tag) filter.tags = String(req.query.tag).toLowerCase().trim();
    if (req.query.search) {
      filter.name = { $regex: escapeRegex(String(req.query.search).trim()), $options: "i" };
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .select("-createdBy")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Product.countDocuments(filter),
    ]);

    res.json({ success: true, total, page, pages: Math.ceil(total / limit), products });
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/products/:id
export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isAvailable: true }).select("-createdBy");
    if (!product) {
      res.status(404).json({ success: false, message: "Product not found" });
      return;
    }
    res.json({ success: true, product });
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ---------- ADMIN ----------

// GET /api/products/admin/all  (unavailable products bhi dikhte hain)
export const getAllProductsAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(parseInt(String(req.query.page)) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 20, 1), 100);

    const filter: Record<string, any> = {};
    if (req.query.category) filter.category = String(req.query.category).toLowerCase().trim();
    if (req.query.foodType) filter.foodType = String(req.query.foodType).toLowerCase().trim();
    if (req.query.tag) filter.tags = String(req.query.tag).toLowerCase().trim();
    if (req.query.search) {
      filter.name = { $regex: escapeRegex(String(req.query.search).trim()), $options: "i" };
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Product.countDocuments(filter),
    ]);

    res.json({ success: true, total, page, pages: Math.ceil(total / limit), products });
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// POST /api/products  (multipart/form-data, image field name: "image")
// export const createProduct = async (req: AuthRequest, res: Response): Promise<void> => {
//   if (!req.file) {
//     res.status(400).json({ success: false, message: "Product image required hai (field name: image)" });
//     return;
//   }

//   let uploaded: { secure_url: string; public_id: string } | null = null;
//   try {
//     uploaded = await uploadBuffer(req.file.buffer);

//     const product = await Product.create({
//       ...req.body,
//       image: { url: uploaded.secure_url, publicId: uploaded.public_id },
//       createdBy: req.user!.id,
//     });

//     res.status(201).json({ success: true, product });
//   } catch (err) {
//     // DB save fail hua to Cloudinary se orphan image hata do
//     if (uploaded) await deleteImage(uploaded.public_id);
//     console.error(err);
//     res.status(500).json({ success: false, message: "Product create nahi ho paya" });
//   }
// };


// uploadBuffer, deleteImage ke import wahi rakho jo aapke file me pehle se hain

// "tags" (array / "a,b" / "a") ya "tag" (single) dono leta hai, sirf valid tags rakhta hai.
// Khali string ("") aaye to [] milta hai.
const parseTags = (body: any): ProductTag[] => {
  const raw = body?.tags ?? body?.tag;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return list
    .map((t) => String(t).trim().toLowerCase())
    .filter((t): t is ProductTag => (PRODUCT_TAGS as readonly string[]).includes(t));
};

export const createProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: "Product image required hai (field name: image)" });
    return;
  }

  let uploaded: { secure_url: string; public_id: string } | null = null;
  try {
    const { name, description, price, category, foodType, isAvailable } = req.body ?? {};

    uploaded = await uploadBuffer(req.file.buffer);

    const product = await Product.create({
      // sirf allowed fields (req.body ko seedha spread nahi kiya)
      name,
      description,
      price: Number(price),
      category,
      foodType,
      tags: parseTags(req.body),
      ...(isAvailable !== undefined ? { isAvailable: String(isAvailable) !== "false" } : {}),
      image: { url: uploaded.secure_url, publicId: uploaded.public_id },
      createdBy: req.user!.id,
    });

    res.status(201).json({ success: true, product });
  } catch (err: any) {
    // DB save fail hua to Cloudinary se orphan image hata do
    if (uploaded) await deleteImage(uploaded.public_id).catch(() => undefined);

    // Mongoose validation (galat foodType, price, khali name...) -> 400
    if (err?.name === "ValidationError") {
      const message = Object.values(err.errors as Record<string, { message: string }>)
        .map((e) => e.message)
        .join(", ");
      res.status(400).json({ success: false, message });
      return;
    }

    console.error(err);
    res.status(500).json({ success: false, message: "Product create nahi ho paya" });
  }
};


// PUT /api/products/:id  (image optional)
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  let uploaded: { secure_url: string; public_id: string } | null = null;
  try {
    if (Object.keys(req.body).length === 0 && !req.file) {
      res.status(400).json({ success: false, message: "Update karne ke liye kuch fields ya image bhejein" });
      return;
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, message: "Product not found" });
      return;
    }

    const oldPublicId = product.image.publicId;
    product.set(req.body);

    if (req.file) {
      uploaded = await uploadBuffer(req.file.buffer);
      product.image = { url: uploaded.secure_url, publicId: uploaded.public_id };
    }

    await product.save();
    if (uploaded) await deleteImage(oldPublicId); // purani image hata do

    res.json({ success: true, product });
  } catch (err) {
    if (uploaded) await deleteImage(uploaded.public_id);
    console.error(err);
    res.status(500).json({ success: false, message: "Product update nahi ho paya" });
  }
};

// DELETE /api/products/:id
export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, message: "Product not found" });
      return;
    }
    await deleteImage(product.image.publicId);
    res.json({ success: true, message: "Product deleted" });
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
};