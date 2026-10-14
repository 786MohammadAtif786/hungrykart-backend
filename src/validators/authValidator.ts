import Joi from "joi";

const mobileRegex = /^[6-9]\d{9}$/;

export const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required().messages({
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name cannot exceed 50 characters",
    "string.empty": "Name is required",
    "any.required": "Name is required",
  }),

  mobile: Joi.string().trim().pattern(mobileRegex).required().messages({
    "string.pattern.base": "Enter a valid 10-digit Indian mobile number (starting with 6-9)",
    "string.empty": "Mobile number is required",
    "any.required": "Mobile number is required",
  }),

  email: Joi.string().trim().lowercase().email().required().messages({
    "string.email": "Enter a valid email address",
    "string.empty": "Email is required",
    "any.required": "Email is required",
  }),

  password: Joi.string()
    .min(8)
    .max(64)
    .pattern(/[A-Za-z]/, "letter")
    .pattern(/\d/, "number")
    .pattern(/[^A-Za-z0-9]/, "special character")
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters long",
      "string.max": "Password cannot exceed 64 characters",
      "string.pattern.name":
        "Password must contain at least one letter, one number and one special character",
      "string.empty": "Password is required",
      "any.required": "Password is required",
    }),
});

export const loginSchema = Joi.object({
  identifier: Joi.alternatives()
    .try(
      Joi.string().trim().lowercase().email(),
      Joi.string().trim().pattern(mobileRegex)
    )
    .required()
    .messages({
      "alternatives.match": "Enter a valid email or 10-digit mobile number",
      "any.required": "Email or mobile number is required",
    }),

  password: Joi.string().required().messages({
    "string.empty": "Password is required",
    "any.required": "Password is required",
  }),
});