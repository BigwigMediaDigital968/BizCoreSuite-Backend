import type { Request, Response } from "express";

import {
  cancelPayout,
  createDeduction,
  deleteDeduction,
  exportPayout,
  generatePayout,
  getEligibleEmployees,
  getMyPayout,
  getPayout,
  getSettings,
  listDeductions,
  listMyPayouts,
  listPayouts,
  markPayoutPaid,
  previewPayout,
  resetSettings,
  reviewDeduction,
  updateSettings,
} from "../services/salaryPayout.service.js";
import {
  cancelPayoutSchema,
  createDeductionSchema,
  deductionListQuerySchema,
  eligibleEmployeesQuerySchema,
  myPayoutsQuerySchema,
  payoutExportQuerySchema,
  payoutInputSchema,
  payoutListQuerySchema,
  reviewDeductionSchema,
  salarySettingsSchema,
} from "../validators/salary.validator.js";
import { AppError } from "../utils/AppError.js";

// Validation failures throw ZodError, which errorHandler turns into a 400.

const requireUser = (req: Request) => {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }
  return req.user;
};

const requireIdParam = (req: Request) => {
  const { id } = req.params;
  if (!id || Array.isArray(id)) {
    throw new AppError("Invalid ID", 400, "INVALID_ID");
  }
  return id;
};

// ---------- Settings ----------

export const getSalarySettings = async (_req: Request, res: Response) => {
  const data = await getSettings();
  return res.status(200).json({ success: true, data });
};

export const updateSalarySettings = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = salarySettingsSchema.parse(req.body ?? {});
  const data = await updateSettings(user, input);
  return res.status(200).json({ success: true, message: "Salary rules saved", data });
};

export const resetSalarySettings = async (_req: Request, res: Response) => {
  const data = await resetSettings();
  return res
    .status(200)
    .json({ success: true, message: "Salary rules reset to defaults", data });
};

// ---------- Payouts ----------

export const getEligiblePayoutEmployees = async (req: Request, res: Response) => {
  const { from, to, branchId } = eligibleEmployeesQuerySchema.parse(req.query);
  const data = await getEligibleEmployees(from, to, branchId);
  return res.status(200).json({ success: true, data });
};

export const previewSalaryPayout = async (req: Request, res: Response) => {
  const input = payoutInputSchema.parse(req.body ?? {});
  const data = await previewPayout(input);
  return res.status(200).json({ success: true, data });
};

export const generateSalaryPayout = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = payoutInputSchema.parse(req.body ?? {});
  const payout = await generatePayout(user, input);
  return res.status(201).json({
    success: true,
    message: `Payout ${payout.payoutNo} generated`,
    data: { _id: payout._id, payoutNo: payout.payoutNo, totals: payout.totals },
  });
};

export const listSalaryPayouts = async (req: Request, res: Response) => {
  const query = payoutListQuerySchema.parse(req.query);
  const result = await listPayouts(query);
  return res
    .status(200)
    .json({ success: true, data: result.items, pagination: result.pagination });
};

export const getSalaryPayout = async (req: Request, res: Response) => {
  const data = await getPayout(requireIdParam(req));
  return res.status(200).json({ success: true, data });
};

export const exportSalaryPayout = async (req: Request, res: Response) => {
  const { format } = payoutExportQuerySchema.parse(req.query);
  const file = await exportPayout(requireIdParam(req), format);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename=${file.filename}`);
  return res.status(200).send(file.body);
};

export const markSalaryPayoutPaid = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const data = await markPayoutPaid(user, requireIdParam(req));
  return res.status(200).json({ success: true, message: "Payout marked as paid", data });
};

export const cancelSalaryPayout = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { reason } = cancelPayoutSchema.parse(req.body ?? {});
  const data = await cancelPayout(user, requireIdParam(req), reason);
  return res.status(200).json({ success: true, message: "Payout cancelled", data });
};

// ---------- Deductions ----------

export const listSalaryDeductions = async (req: Request, res: Response) => {
  const query = deductionListQuerySchema.parse(req.query);
  const result = await listDeductions(query);
  return res
    .status(200)
    .json({ success: true, data: result.items, pagination: result.pagination });
};

export const createSalaryDeduction = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = createDeductionSchema.parse(req.body ?? {});
  const data = await createDeduction(user, input);
  return res.status(201).json({ success: true, message: "Deduction recorded", data });
};

export const reviewSalaryDeduction = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { status, remark } = reviewDeductionSchema.parse(req.body ?? {});
  const data = await reviewDeduction(user, requireIdParam(req), status, remark);
  return res.status(200).json({
    success: true,
    message: status === "approved" ? "Deduction approved" : "Deduction rejected",
    data,
  });
};

export const deleteSalaryDeduction = async (req: Request, res: Response) => {
  await deleteDeduction(requireIdParam(req));
  return res.status(200).json({ success: true, message: "Deduction deleted" });
};

// ---------- Employee self-service ----------

export const listMySalaryPayouts = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { page, limit } = myPayoutsQuerySchema.parse(req.query);
  const result = await listMyPayouts(user.id, page, limit);
  return res
    .status(200)
    .json({ success: true, data: result.items, pagination: result.pagination });
};

export const getMySalaryPayout = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const data = await getMyPayout(user.id, requireIdParam(req));
  return res.status(200).json({ success: true, data });
};
