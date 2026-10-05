import { z } from "zod";

export const updateBranchAttendanceConfigSchema = z.object({
  enabled: z.boolean().optional(),

  timezone: z.string().trim().min(1).max(100).optional(),

  location: z
    .object({
      latitude: z.number().min(-90).max(90),

      longitude: z.number().min(-180).max(180),

      radiusMeters: z.number().min(10).max(5000),
    })
    .optional(),

  workingDays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .refine((days) => new Set(days).size === days.length, {
      message: "Working days cannot contain duplicates",
    })
    .optional(),

  workingHours: z
    .object({
      startTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid start time"),

      endTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid end time"),
    })
    .optional(),

  gracePeriodMinutes: z.number().int().min(0).max(180).optional(),
});
