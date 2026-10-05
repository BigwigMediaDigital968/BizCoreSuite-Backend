import type { Request, Response, NextFunction } from "express";
import { CallLog } from "../models/CallLog.js";

import {
  createLead,
  listLeads,
  getLeadById,
  // assignLead,
  updateLeadStatus,
  addLeadRemark,
  getLeadActivities,
} from "../services/lead.service.js";

import {
  createLeadSchema,
  listLeadQuerySchema,
  assignLeadSchema,
  updateLeadStatusSchema,
  addLeadRemarkSchema,
} from "../validators/lead.validator.js";

import { createAuditLog } from "../services/audit.service.js";

export const createLeadController = async (
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

    /**
     * Validate request body
     */

    const data = createLeadSchema.parse(req.body);

    /**
     * Create lead through service
     */

    const lead = await createLead(data, req.user);

    /**
     * Audit log
     */

    await createAuditLog({
      actor: req.user.id,

      action: "LEAD_CREATED",

      entity: "Lead",

      entityId: lead._id.toString(),

      branch: lead.branch?.toString(),

      metadata: {
        name: lead.name,
        phone: `${lead.phoneCountryCode}${lead.phone}`,
        source: lead.source,
        sourceType: lead.sourceType,
      },

      ipAddress: req.ip,

      userAgent: req.get("user-agent"),
    });

    return res.status(201).json({
      success: true,

      message: "Lead created successfully",

      data: {
        lead,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLeadCallLogs = async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    // Filter by branch to enforce RBAC
    const filter: any = { lead: leadId };
    if (req.user?.role !== "head" && req.user?.branches) {
      filter.branch = { $in: req.user.branches };
    }

    const callHistory = await CallLog.find(filter)
      .populate("caller", "name email role")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: callHistory });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const listLeadsController = async (
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

    const query = listLeadQuerySchema.parse(req.query);

    const result = await listLeads(req.user, query);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getLeadController = async (
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

    const leadId = req.params.id;

    if (!leadId || Array.isArray(leadId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lead ID",
        code: "INVALID_LEAD_ID",
      });
    }

    const lead = await getLeadById(leadId, req.user);

    return res.status(200).json({
      success: true,
      data: {
        lead,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateLeadStatusController = async (
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

    const data = updateLeadStatusSchema.parse(req.body);

    const lead = await updateLeadStatus({
      leadId,

      status: data.status,

      remark: data.remark,

      userId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      message: "Lead status updated successfully",
      data: {
        lead,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const addLeadRemarkController = async (
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

    const data = addLeadRemarkSchema.parse(req.body);

    const lead = await addLeadRemark({
      leadId,

      remark: data.remark,

      userId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      message: "Lead remark added successfully",
      data: {
        lead,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLeadActivitiesController = async (
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

    const activities = await getLeadActivities(leadId);

    return res.status(200).json({
      success: true,
      data: {
        activities,
      },
    });
  } catch (error) {
    next(error);
  }
};
