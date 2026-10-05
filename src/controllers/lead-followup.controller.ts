import type { Request, Response, NextFunction } from "express";

import {
  createLeadFollowUp,
  completeLeadFollowUp,
  getLeadFollowUps,
  getMyPendingFollowUps,
} from "../services/lead-followup.service.js";

import { createLeadFollowUpSchema } from "../validators/lead-followup.validator.js";

import { completeLeadFollowUpSchema } from "../validators/lead-followup-complete.validator.js";

export const createLeadFollowUpController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    const leadId =
      typeof req.params.id === "string" ? req.params.id : undefined;

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: "Lead ID is required",
        code: "LEAD_ID_REQUIRED",
      });
    }

    const data = createLeadFollowUpSchema.parse(req.body);

    const followUp = await createLeadFollowUp({
      leadId,

      userId: req.user.id,

      scheduledAt: data.scheduledAt,

      remark: data.remark,
    });

    return res.status(201).json({
      success: true,

      message: "Follow-up scheduled successfully",

      data: {
        followUp,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const completeLeadFollowUpController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    const followUpId =
      typeof req.params.followUpId === "string"
        ? req.params.followUpId
        : undefined;

    if (!followUpId) {
      return res.status(400).json({
        success: false,
        message: "Follow-up ID is required",
        code: "FOLLOW_UP_ID_REQUIRED",
      });
    }

    const data = completeLeadFollowUpSchema.parse(req.body);

    const followUp = await completeLeadFollowUp({
      followUpId,

      userId: req.user.id,

      remark: data.remark,
    });

    return res.status(200).json({
      success: true,

      message: "Follow-up completed successfully",

      data: {
        followUp,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLeadFollowUpsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    const leadId =
      typeof req.params.id === "string" ? req.params.id : undefined;

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: "Lead ID is required",
        code: "LEAD_ID_REQUIRED",
      });
    }

    const followUps = await getLeadFollowUps(leadId);

    return res.status(200).json({
      success: true,

      data: {
        followUps,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getMyPendingFollowUpsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    const followUps = await getMyPendingFollowUps(req.user.id);

    return res.status(200).json({
      success: true,

      data: {
        followUps,
      },
    });
  } catch (error) {
    next(error);
  }
};
