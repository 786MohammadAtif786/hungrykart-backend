import { Request, Response } from "express";
import { User } from "../models/User";
import { signToken } from "../utils/jwt";
import { AuthRequest } from "../middleware/auth";

const userResponse = (user: any) => ({
  id: user._id,
  name: user.name,
  mobile: user.mobile,
  email: user.email,
  role: user.role,
});

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, mobile, email, password } = req.body;

    const exists = await User.findOne({ $or: [{ email }, { mobile }] });
    if (exists) {
      res.status(409).json({
        success: false,
        message: "Email ya mobile already registered hai",
      });
      return;
    }

    const user = await User.create({ name, mobile, email, password });
    const token = signToken({ id: user.id, role: user.role });

    res.status(201).json({ success: true, token, user: userResponse(user) });
  } catch (err: any) {
    if (err.name === "ValidationError") {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, password } = req.body;

    const user = await User.findOne({
      $or: [{ email: identifier }, { mobile: identifier }],
    }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    const token = signToken({ id: user.id, role: user.role });
    res.json({ success: true, token, user: userResponse(user) });
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/auth/me
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await User.findById(req.user!.id);
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }
  res.json({ success: true, user: userResponse(user) });
};
