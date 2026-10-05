import { z } from "zod";
import { LEAD_STATUS } from "../constants/leadStatus.js";

export const createLeadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must contain at least 2 characters")
    .max(150, "Name cannot exceed 150 characters"),

  phoneCountryCode: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{0,3}$/, "Invalid phone country code"),

  phone: z
    .string()
    .trim()
    .regex(/^[0-9]{6,15}$/, "Phone number must contain 6 to 15 digits"),

  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(150)
    .optional()
    .or(z.literal("")),

  city: z.string().trim().max(100).optional(),

  industry: z.string().trim().max(100).optional(),

  message: z.string().trim().max(5000).optional(),

  remarks: z.string().trim().max(5000).optional(),

  source: z.string().trim().min(1, "Lead source is required").max(100),

  sourceType: z.enum(["MANUAL", "EXCEL", "API", "IMPORT"]),

  branchId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid branch ID")
    .optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const listLeadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),

  search: z.string().trim().max(100).optional(),

  status: z
    .enum([
      "new",
      "assigned",
      "contacted",
      "follow_up",
      "intrested",
      "Qualified",
      "Converted",
      "Lost",
      "Closed",
    ])
    .optional(),

  source: z.string().trim().max(100).optional(),

  branchId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid branch ID")
    .optional(),

  assignedTo: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid employee ID")
    .optional(),

  fromDate: z.string().datetime().optional(),

  toDate: z.string().datetime().optional(),

  sortBy: z
    .enum(["createdAt", "updatedAt", "name", "status"])
    .default("createdAt"),

  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListLeadQuery = z.infer<typeof listLeadQuerySchema>;

export const assignLeadSchema = z.object({
  employeeId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid employee ID"),

  reason: z.string().trim().max(500).optional(),
});

export type AssignLeadInput = z.infer<typeof assignLeadSchema>;

export const updateLeadStatusSchema = z.object({
  status: z.enum(Object.values(LEAD_STATUS) as [string, ...string[]]),

  remark: z
    .string()
    .trim()
    .max(2000, "Remark cannot exceed 2000 characters")
    .optional(),
});

export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;

export const addLeadRemarkSchema = z.object({
  remark: z
    .string()
    .trim()
    .min(1, "Remark is required")
    .max(2000, "Remark cannot exceed 2000 characters"),
});

export type AddLeadRemarkInput = z.infer<typeof addLeadRemarkSchema>;

export const createLeadFollowUpSchema = z.object({
  followUpAt: z.coerce.date(),

  remark: z
    .string()
    .trim()
    .max(2000, "Remark cannot exceed 2000 characters")
    .optional(),
});

export type CreateLeadFollowUpInput = z.infer<typeof createLeadFollowUpSchema>;
