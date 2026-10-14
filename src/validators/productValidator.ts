import Joi from "joi";
import { FOOD_TYPES, PRODUCT_TAGS } from "../models/Product";

const name = Joi.string().trim().min(2).max(100).messages({
  "string.min": "Name must be at least 2 characters long",
  "string.max": "Name cannot exceed 100 characters",
  "string.empty": "Name is required",
});

const description = Joi.string().trim().min(5).max(1000).messages({
  "string.min": "Description must be at least 5 characters long",
  "string.max": "Description cannot exceed 1000 characters",
  "string.empty": "Description is required",
});

const price = Joi.number().min(0).precision(2).messages({
  "number.base": "Price must be a number",
  "number.min": "Price cannot be negative",
});



const category = Joi.string().trim().lowercase().min(2).max(30).messages({
  "string.min": "Category must be at least 2 characters long",
  "string.max": "Category cannot exceed 30 characters",
  "string.empty": "Category is required",
});

const foodType = Joi.string()
  .trim()
  .lowercase()
  .valid(...FOOD_TYPES)
  .messages({
    "any.only": "foodType must be either 'veg' or 'non-veg'",
    "string.empty": "foodType is required",
  });

const tags = Joi.array()
  .items(Joi.string().trim().lowercase().valid(...PRODUCT_TAGS))
  .single()
  .unique()
  .max(PRODUCT_TAGS.length)
  .messages({
    "any.only": `Tags can only be one of: ${PRODUCT_TAGS.join(", ")}`,
    "array.unique": "Tags cannot contain duplicates",
  });

const isAvailable = Joi.boolean();

export const createProductSchema = Joi.object({
  name: name.required().messages({ "any.required": "Name is required" }),
  description: description.required().messages({ "any.required": "Description is required" }),
  price: price.required().messages({ "any.required": "Price is required" }),
  category: category.required().messages({ "any.required": "Category is required (e.g. pizza, burger)" }),
  foodType: foodType.required().messages({ "any.required": "foodType is required (veg or non-veg)" }),
  tags,
  isAvailable,
});

// All fields are optional on update
export const updateProductSchema = Joi.object({
  name,
  description,
  price,
  category,
  foodType,
  tags,
  isAvailable,
});