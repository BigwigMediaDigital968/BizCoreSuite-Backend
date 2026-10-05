import { User, type IUser } from "../models/User.js";

import { comparePassword, hashPassword } from "../utils/password.js";

import { generateAccessToken } from "../utils/jwt.js";

import { AppError } from "../utils/AppError.js";

import { createSession } from "./session.service.js";

export const loginUser = async (
  email: string,
  password: string,
  userAgent?: string,
  ipAddress?: string,
) => {
  const user = (await User.findOne({
    email: email.toLowerCase(),
  })
    .select("+password")
    .exec()) as IUser | null;

  if (!user) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  if (!user.isActive) {
    throw new AppError(
      "Your account has been deactivated",
      403,
      "ACCOUNT_INACTIVE",
    );
  }

  const passwordMatches = await comparePassword(password, user.password);

  if (!passwordMatches) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  user.lastLoginAt = new Date();

  await user.save();

  const accessToken = generateAccessToken(user._id.toString());

  const refreshToken = await createSession({
    userId: user._id.toString(),
    userAgent,
    ipAddress,
  });

  return {
    accessToken,
    refreshToken,

    user: {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      branches: (user.branches || []).map((branch) => branch.toString()),
    },
  };
};

/**
 * Self-service profile update. Deliberately name-only: email changes affect
 * login identity and are handled through the admin-facing user management
 * flow (PATCH /users/:id) instead.
 */
export const updateOwnProfile = async (
  userId: string,
  data: { name: string },
) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { name: data.name },
    { new: true },
  ).select("_id name email role branches isActive");

  if (!user) {
    throw new AppError("User account not found", 404, "USER_NOT_FOUND");
  }

  return user;
};

export const changeOwnPassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
) => {
  const user = (await User.findById(userId)
    .select("+password")
    .exec()) as IUser | null;

  if (!user) {
    throw new AppError("User account not found", 404, "USER_NOT_FOUND");
  }

  const passwordMatches = await comparePassword(
    currentPassword,
    user.password,
  );

  if (!passwordMatches) {
    throw new AppError(
      "Current password is incorrect",
      401,
      "INVALID_CURRENT_PASSWORD",
    );
  }

  user.password = await hashPassword(newPassword);

  await user.save();
};

export const changeEmployeePassword = async (
  empoyeeId: string,
  newPassword: string,
) => {
  const user = (await User.findById(empoyeeId)
    .select("+password")
    .exec()) as IUser | null;

  if (!user) {
    throw new AppError("Emploee account not found", 404, "USER_NOT_FOUND");
  }

  user.password = await hashPassword(newPassword);

  await user.save();
};
