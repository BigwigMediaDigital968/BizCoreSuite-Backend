import { z } from "zod";

export const createBranchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(100),

  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(
      /^[A-Z0-9-]+$/,
      "Code may contain only uppercase letters, numbers and hyphens"
    ),

  description: z
    .string()
    .trim()
    .max(500)
    .optional(),

  address: z
    .string()
    .trim()
    .max(500)
    .optional(),

  city: z
    .string()
    .trim()
    .max(100)
    .optional(),

  state: z
    .string()
    .trim()
    .max(100)
    .optional(),

  country: z
    .string()
    .trim()
    .max(100)
    .optional(),

  phone: z
    .string()
    .trim()
    .max(20)
    .optional(),

  email: z
    .email()
    .optional()
});

export const updateBranchSchema =
  createBranchSchema.partial();