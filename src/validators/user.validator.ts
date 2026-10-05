import { z } from "zod";

export const updateUserSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .optional(),

    email: z
      .string()
      .trim()
      .email()
      .toLowerCase()
      .optional(),

    role: z
      .enum([
        "admin",
        "manager",
        "employee",
      ])
      .optional(),
  })
  .strict();

  export const updateUserStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();