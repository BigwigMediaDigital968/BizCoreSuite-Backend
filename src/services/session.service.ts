import { Session } from "../models/Session.js";

import {
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiry,
} from "../utils/refreshToken.js";

interface CreateSessionInput {
  userId: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
}

export const createSession = async ({
  userId,
  deviceName,
  userAgent,
  ipAddress,
}: CreateSessionInput) => {
  const refreshToken = generateRefreshToken();

  const refreshTokenHash = hashRefreshToken(refreshToken);

  await Session.create({
    user: userId,
    refreshTokenHash,
    deviceName,
    userAgent,
    ipAddress,
    expiresAt: getRefreshTokenExpiry(),
  });

  return refreshToken;
};

export const findValidSession = async (refreshToken: string) => {
  const refreshTokenHash = hashRefreshToken(refreshToken);

  return Session.findOne({
    refreshTokenHash,
    revokedAt: null,
    expiresAt: {
      $gt: new Date(),
    },
  });
};

export const revokeSession = async (sessionId: string) => {
  await Session.findByIdAndUpdate(sessionId, {
    revokedAt: new Date(),
  });
};

export const getUserSessions = async (userId: string) => {
  return Session.find({
    user: userId,
    expiresAt: {
      $gt: new Date(),
    },
  })
    .select("_id deviceName userAgent ipAddress expiresAt revokedAt createdAt")
    .sort({
      createdAt: -1,
    })
    .lean();
};

export const revokeUserSession = async (userId: string, sessionId: string) => {
  const session = await Session.findOneAndUpdate(
    {
      _id: sessionId,
      user: userId,
      revokedAt: null,
    },
    {
      revokedAt: new Date(),
    },
    { returnDocument: "after" },
  );

  return session;
};

export const revokeAllUserSessions = async (userId: string) => {
  const result = await Session.updateMany(
    {
      user: userId,
      revokedAt: null,
    },
    {
      revokedAt: new Date(),
    },
  );

  return result;
};
