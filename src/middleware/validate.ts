import { Request, Response, NextFunction } from "express";
import { ObjectSchema } from "joi";

export const validate =
  (schema: ObjectSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.details.map((d) => ({
          field: d.path.join("."),
          message: d.message,
        })),
      });
      return;
    }

    req.body = value; // sanitized (trimmed/lowercased) body
    next();
  };
