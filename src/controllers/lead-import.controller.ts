import type { Request, Response, NextFunction } from "express";

import { importLeadsFromExcel } from "../services/lead-import.service.js";

import { createAuditLog } from "../services/audit.service.js";

export const importLeadsController = async (
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

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "Excel file is required",
        code: "IMPORT_FILE_REQUIRED",
      });
    }

    const branchId = String(req.body.branchId ?? "").trim();

    if (!branchId) {
      return res.status(400).json({
        success: false,
        message: "Branch ID is required",
        code: "BRANCH_ID_REQUIRED",
      });
    }

    const result = await importLeadsFromExcel({
      buffer: file.buffer,

      branchId,

      createdBy: req.user.id,
    });

    await createAuditLog({
      actor: req.user.id,

      action: "LEADS_IMPORTED",

      entity: "Lead",

      branch: branchId,

      metadata: {
        fileName: file.originalname,

        totalRows: result.totalRows,

        successful: result.successful,

        duplicates: result.duplicates,

        failed: result.failed,
      },

      ipAddress: req.ip,

      userAgent: req.get("user-agent"),
    });

    return res.status(201).json({
      success: true,

      message: "Lead import completed",

      data: result,
    });
  } catch (error) {
    next(error);
  }
};
