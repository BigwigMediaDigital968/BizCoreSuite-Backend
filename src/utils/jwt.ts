import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

export interface AccessTokenPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

export const generateAccessToken = (
  userId: string,
): string => {
  return jwt.sign(
    {
      sub: userId,
    },
    env.jwtSecret,
    {
      expiresIn:
        env.jwtExpiresIn,
    } as jwt.SignOptions,
  );
};

export const verifyAccessToken = (
  token: string,
): AccessTokenPayload => {
  const decoded =
    jwt.verify(
      token,
      env.jwtSecret,
    ) as AccessTokenPayload;

  if (!decoded.sub) {
    throw new Error(
      "Invalid access token payload",
    );
  }

  return decoded;
};

interface LateCheckInTokenPayload {
  sub: string;
  purpose: "late-checkin";
  iat?: number;
  exp?: number;
}

/**
 * Short-lived, single-purpose token issued alongside an AFTER_HOURS_LOCKOUT /
 * HOLIDAY_LOCKOUT login response. The user has already proven their identity
 * by passing password verification in loginUser() before this is issued, but
 * no access token is granted (access is blocked). This token lets them prove
 * that same identity to POST /late-checkin/submit-reason without one — it is
 * NOT a substitute access token, it only carries the "late-checkin" purpose
 * and expires quickly.
 */
export const generateLateCheckInToken = (userId: string): string => {
  return jwt.sign(
    { sub: userId, purpose: "late-checkin" },
    env.jwtSecret,
    { expiresIn: "15m" },
  );
};

export const verifyLateCheckInToken = (
  token: string,
): LateCheckInTokenPayload => {
  const decoded = jwt.verify(token, env.jwtSecret) as LateCheckInTokenPayload;

  if (!decoded.sub || decoded.purpose !== "late-checkin") {
    throw new Error("Invalid late check-in token payload");
  }

  return decoded;
};