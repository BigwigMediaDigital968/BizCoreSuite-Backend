import type { NextFunction, Request, Response } from "express";

import {
  getUserSessions,
  revokeUserSession,
  revokeAllUserSessions,
} from "../services/session.service.js";

import { AppError } from "../utils/AppError.js";
import { auditRequest } from "../utils/audit.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import { AUDIT_ENTITIES } from "../constants/auditEntities.js";

export const getSessionsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      throw new AppError(
        "Authentication required",
        401,
        "AUTHENTICATION_REQUIRED",
      );
    }

    const sessions = await getUserSessions(req.user.id);

    return res.status(200).json({
      success: true,
      data: {
        sessions,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const revokeSessionController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      throw new AppError(
        "Authentication required",
        401,
        "AUTHENTICATION_REQUIRED",
      );
    }

    const sessionId = req.params.id;

    if (typeof sessionId !== "string" || !sessionId.trim()) {
      throw new AppError(
        "Valid session ID is required",
        400,
        "INVALID_SESSION_ID",
      );
    }

    const session = await revokeUserSession(req.user.id, sessionId);

    await auditRequest({
      req,

      action: AUDIT_ACTIONS.SESSION_REVOKED,

      entity: AUDIT_ENTITIES.SESSION,

      entityId: sessionId.toString(),

      metadata: {
        reason: "USER_REQUESTED",
      },
    });

    if (!session) {
      throw new AppError(
        "Session not found or already revoked",
        404,
        "SESSION_NOT_FOUND",
      );
    }

    return res.status(200).json({
      success: true,
      message: "Session revoked successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const revokeAllSessionsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      throw new AppError(
        "Authentication required",
        401,
        "AUTHENTICATION_REQUIRED",
      );
    }

    await revokeAllUserSessions(req.user.id);

    await auditRequest({
      req,

      action: AUDIT_ACTIONS.ALL_SESSIONS_REVOKED,

      entity: AUDIT_ENTITIES.SESSION,

      metadata: {
        reason: "USER_REQUESTED",
      },
    });

    return res.status(200).json({
      success: true,
      message: "All sessions revoked successfully",
    });
  } catch (error) {
    next(error);
  }
};
