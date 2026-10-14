import multer from "multer";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    const err: any = new Error("Sirf JPG, PNG ya WEBP images allowed hain");
    err.statusCode = 400;
    cb(err);
  },
});
