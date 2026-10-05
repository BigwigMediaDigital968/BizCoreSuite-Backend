import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { User } from "../models/User.js";

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization header",
        code: "INVALID_AUTHORIZATION_HEADER",
      });
    }

    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.sub)
      .select("_id name email role branches isActive")
      .lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found",
        code: "ACCOUNT_NOT_FOUND",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Your account is inactive",
        code: "ACCOUNT_INACTIVE",
      });
    }

    const userBranches = (user.branches || []).map((branch) => branch.toString());

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: userBranches, // ✅ Satisfies AuthenticatedUser.branchId
      branches: userBranches,
    };

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
      code: "INVALID_ACCESS_TOKEN",
    });
  }
};