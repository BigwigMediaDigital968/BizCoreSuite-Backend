// import type { Request, Response, NextFunction } from "express";
// import {
//   assignLead,
//   assignLeadsBulk,
// } from "../services/lead-assignment.service.js";
// import {
//   assignLeadSchema,
//   assignLeadsBulkSchema,
// } from "../validators/lead-assignment.validator.js";
// import { createAuditLog } from "../services/audit.service.js";

// export const assignLeadController = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//         code: "AUTHENTICATION_REQUIRED",
//       });
//     }

//     const data = assignLeadSchema.parse(req.body);
//     const leadId =
//       typeof req.params.id === "string" ? req.params.id : undefined;

//     if (!leadId) {
//       return res.status(400).json({
//         success: false,
//         message: "Lead ID is required",
//         code: "LEAD_ID_REQUIRED",
//       });
//     }

//     const lead = await assignLead({
//       leadId,
//       employeeId: data.employeeId,
//       actorId: req.user.id,
//     });

//     await createAuditLog({
//       actor: req.user.id,
//       action: "LEAD_ASSIGNED",
//       entity: "Lead",
//       entityId: lead._id.toString(),
//       branch: lead.branch?.toString(),
//       metadata: {
//         assignedTo: data.employeeId,
//         assignedAt: lead.assignedAt,
//       },
//       ipAddress: req.ip,
//       userAgent: req.get("user-agent"),
//     });

//     return res.status(200).json({
//       success: true,
//       message: "Lead assigned successfully",
//       data: { lead },
//     });
//   } catch (error) {
//     next(error);
//   }
// };

// export const bulkAssignLeadsController = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//         code: "AUTHENTICATION_REQUIRED",
//       });
//     }

//     const data = assignLeadsBulkSchema.parse(req.body);

//     const result = await assignLeadsBulk({
//       leadIds: data.leadIds,
//       employeeId: data.employeeId,
//       actorId: req.user.id,
//     });

//     await createAuditLog({
//       actor: req.user.id,
//       action: "BULK_LEADS_ASSIGNED",
//       entity: "Lead",
//       entityId: "BULK",
//       branch: "SYSTEM",
//       metadata: {
//         assignedTo: data.employeeId,
//         leadIds: data.leadIds,
//         count: result.assignedCount,
//       },
//       ipAddress: req.ip,
//       userAgent: req.get("user-agent"),
//     });

//     return res.status(200).json({
//       success: true,
//       message: `${result.assignedCount} leads assigned successfully`,
//       data: result,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

import type { Request, Response, NextFunction } from "express";
import {
  assignLead,
  assignLeadsBulk,
} from "../services/lead-assignment.service.js";
import {
  assignLeadSchema,
  assignLeadsBulkSchema,
} from "../validators/lead-assignment.validator.js";
import { createAuditLog } from "../services/audit.service.js";

export const assignLeadController = async (
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

    const data = assignLeadSchema.parse(req.body);
    const leadId =
      typeof req.params.id === "string" ? req.params.id : undefined;

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: "Lead ID is required",
        code: "LEAD_ID_REQUIRED",
      });
    }

    const { lead, branchId: resolvedBranchId } = await assignLead({
      leadId,
      employeeId: data.employeeId,
      branchId: data.branchId,
      actorId: req.user.id,
    });

    await createAuditLog({
      actor: req.user.id,
      action: "LEAD_ASSIGNED",
      entity: "Lead",
      entityId: lead._id.toString(),
      branch: resolvedBranchId,
      metadata: {
        assignedTo: data.employeeId,
        branchId: data.branchId,
        assignedAt: lead.assignedAt,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(200).json({
      success: true,
      message: "Lead assigned successfully",
      data: { lead },
    });
  } catch (error) {
    next(error);
  }
};

export const bulkAssignLeadsController = async (
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

    const data = assignLeadsBulkSchema.parse(req.body);

    const result = await assignLeadsBulk({
      leadIds: data.leadIds,
      employeeId: data.employeeId,
      branchId: data.branchId,
      actorId: req.user.id,
    });

    // Use the first assigned lead's ID or omit non-ObjectId string literals
    const firstLeadId = data.leadIds[0];

    await createAuditLog({
      actor: req.user.id,
      action: "BULK_LEADS_ASSIGNED",
      entity: "Lead",
      entityId: firstLeadId, // ✅ Valid 24-char ObjectId string from request
      branch: undefined, // ✅ Pass undefined instead of invalid string "SYSTEM"
      metadata: {
        assignedTo: data.employeeId,
        branchId: data.branchId,
        leadIds: data.leadIds,
        count: result.assignedCount,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(200).json({
      success: true,
      message: `${result.assignedCount} leads assigned successfully`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
