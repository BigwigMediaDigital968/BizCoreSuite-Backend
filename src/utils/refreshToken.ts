import crypto from "node:crypto";

export const generateRefreshToken =
  (): string => {
    return crypto
      .randomBytes(64)
      .toString("hex");
  };

export const hashRefreshToken =
  (
    token: string,
  ): string => {
    return crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");
  };

export const getRefreshTokenExpiry =
  (): Date => {
    const expiresAt =
      new Date();

    expiresAt.setDate(
      expiresAt.getDate() + 7,
    );

    return expiresAt;
  };