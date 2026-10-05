import type { Request, Response } from "express";

import {
  createHoliday,
  getBranchHolidays,
  updateHoliday,
  deleteHoliday,
} from "../services/holiday.service.js";

import {
  createHolidaySchema,
  updateHolidaySchema,
} from "../validators/holiday.validator.js";

import { createAuditLog } from "../services/audit.service.js";

export const createHolidayController = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const data = createHolidaySchema.parse(req.body);

  const holiday = await createHoliday(data, req.user.id);

  await createAuditLog({
    actor: req.user.id,
    action: "HOLIDAY_CREATED",
    entity: "Holiday",
    entityId: holiday._id.toString(),
    branch: holiday.branch.toString(),
    metadata: {
      name: holiday.name,
      date: holiday.date,
      type: holiday.type,
    },
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  return res.status(201).json({
    success: true,
    message: "Holiday created successfully",
    data: holiday,
  });
};

export const getBranchHolidaysController = async (
  req: Request,
  res: Response,
) => {
  const branchId = req.params.branchId;

  if (typeof branchId !== "string") {
    return res.status(400).json({
      success: false,
      message: "Invalid branch ID",
      code: "INVALID_BRANCH_ID",
    });
  }

  const yearParam = req.query.year;

  let year: number | undefined;

  if (typeof yearParam === "string") {
    year = Number(yearParam);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: "Invalid year",
        code: "INVALID_YEAR",
      });
    }
  }

  const holidays = await getBranchHolidays(branchId, year);

  return res.status(200).json({
    success: true,
    data: holidays,
  });
};

export const updateHolidayController = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const holidayId = req.params.id;

  if (typeof holidayId !== "string") {
    return res.status(400).json({
      success: false,
      message: "Invalid holiday ID",
      code: "INVALID_HOLIDAY_ID",
    });
  }

  const data = updateHolidaySchema.parse(req.body);

  const holiday = await updateHoliday(holidayId, data, req.user.id);

  await createAuditLog({
    actor: req.user.id,
    action: "HOLIDAY_UPDATED",
    entity: "Holiday",
    entityId: holiday._id.toString(),
    branch: holiday.branch.toString(),
    metadata: {
      name: holiday.name,
    },
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  return res.status(200).json({
    success: true,
    message: "Holiday updated successfully",
    data: holiday,
  });
};

export const deleteHolidayController = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const holidayId = req.params.id;

  if (typeof holidayId !== "string") {
    return res.status(400).json({
      success: false,
      message: "Invalid holiday ID",
      code: "INVALID_HOLIDAY_ID",
    });
  }

  const holiday = await deleteHoliday(holidayId, req.user.id);

  await createAuditLog({
    actor: req.user.id,
    action: "HOLIDAY_DELETED",
    entity: "Holiday",
    entityId: holiday._id.toString(),
    branch: holiday.branch.toString(),
    metadata: {
      name: holiday.name,
    },
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  return res.status(200).json({
    success: true,
    message: "Holiday deleted successfully",
  });
};
