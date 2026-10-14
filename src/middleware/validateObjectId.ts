import { Request, Response, NextFunction } from "express";
import { isValidObjectId } from "mongoose";

export const validateObjectId =
  (param = "id") =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!isValidObjectId(req.params[param])) {
      res.status(400).json({ success: false, message: "Invalid ID" });
      return;
    }
    next();
  };
