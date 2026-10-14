import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { Role, User } from "../models/User";

export interface AuthRequest extends Request {
  user?: { id: string; role: Role };
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({ success: false, message: "Token missing" });
      return;
    }

    const decoded = verifyToken(header.split(" ")[1]);
    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(401).json({ success: false, message: "User no longer exists" });
      return;
    }

    req.user = { id: user.id, role: user.role };
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

export const authorize =
  (...roles: Role[]) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }
    next();
  };
