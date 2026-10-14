import type { ErrorRequestHandler } from "express";
import { HttpError } from "../models/pricing";

// app.use(errorHandler) sabse last me lagao (agar pehle se nahi hai)
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Server error";
  res.status(status).json({ message: status === 500 ? "Server error" : message });
  if (status === 500) console.error(err);
};