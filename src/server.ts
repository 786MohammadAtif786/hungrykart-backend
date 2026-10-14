import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import mongoose from "mongoose";
import multer from "multer";
import authRoutes from "./routes/authRoutes";
import productRoutes from "./routes/productRoutes";
import paymentRoutes from "./routes/Paymentroutes";
import orderRoutes from "./routes/Orderroutes";
import { errorHandler } from "./utils/Errorhandler";
import http from "http";
import { initSocket } from "./socket";
import deliveryRoutes from "./routes/Deliveryroutes";


const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ success: true, message: "Auth API running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/delivery", deliveryRoutes);              
app.use(errorHandler);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Image 5MB se badi nahi honi chahiye"
        : err.code === "LIMIT_UNEXPECTED_FILE"
        ? "Image ka field name 'image' hona chahiye"
        : err.message;
    res.status(400).json({ success: false, message });
    return;
  }

  if (err.type === "entity.parse.failed") {
    res.status(400).json({ success: false, message: "Invalid JSON body" });
    return;
  }

  const status = err.statusCode || 500;
  if (status === 500) console.error(err);
  res.status(status).json({
    success: false,
    message: status === 500 ? "Server error" : err.message,
  });
});

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);   
initSocket(server);

const start = async () => {
  try {
    const required = [
      "MONGO_URI",
      "JWT_SECRET",
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
    ];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}`);

    await mongoose.connect(process.env.MONGO_URI as string);
    console.log("MongoDB connected");

    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
};

start();
