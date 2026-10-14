import { Schema, model, Document, Types } from "mongoose";

export const FOOD_TYPES = ["veg", "non-veg"] as const;
export const PRODUCT_TAGS = ["popular", "bestseller", "premium", "spicy"] as const;

export type FoodType = (typeof FOOD_TYPES)[number];
export type ProductTag = (typeof PRODUCT_TAGS)[number];

export interface IProduct extends Document {
  name: string;
  description: string;
  price: number;
  category: string;
  foodType: FoodType;
  tags: ProductTag[];
  image: { url: string; publicId: string };
  isAvailable: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true, lowercase: true, index: true },
    foodType: { type: String, enum: [...FOOD_TYPES], required: true, index: true },
    tags: { type: [String], enum: [...PRODUCT_TAGS], default: [] },
    image: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
    },
    isAvailable: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

productSchema.index({ name: "text", description: "text" });

export const Product = model<IProduct>("Product", productSchema);