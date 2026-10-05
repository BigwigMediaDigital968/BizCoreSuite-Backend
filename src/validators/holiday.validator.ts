import { z } from "zod";

import { HOLIDAY_TYPE } from "../constants/holiday.js";

export const createHolidaySchema = z.object({
  branchId: z.string().min(1),

  date: z.string().datetime({
    offset: true,
  }),

  name: z.string().trim().min(2).max(150),

  description: z.string().trim().max(500).optional(),

  type: z
    .enum([
      HOLIDAY_TYPE.NATIONAL,
      HOLIDAY_TYPE.REGIONAL,
      HOLIDAY_TYPE.COMPANY,
      HOLIDAY_TYPE.OPTIONAL,
    ])
    .default(HOLIDAY_TYPE.COMPANY),
});

export const updateHolidaySchema = z.object({
  date: z
    .string()
    .datetime({
      offset: true,
    })
    .optional(),

  name: z.string().trim().min(2).max(150).optional(),

  description: z.string().trim().max(500).optional(),

  type: z
    .enum([
      HOLIDAY_TYPE.NATIONAL,
      HOLIDAY_TYPE.REGIONAL,
      HOLIDAY_TYPE.COMPANY,
      HOLIDAY_TYPE.OPTIONAL,
    ])
    .optional(),

  isActive: z.boolean().optional(),
});
