import { z } from "zod";
import { ATTENDANCE_WORK_MODE } from "../constants/attendance.js";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID");

const coordinatesSchema = z.object({
  latitude: z
    .number()
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90"),

  longitude: z
    .number()
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180"),
});

export const attendanceCheckInSchema = z
  .object({
    workMode: z.nativeEnum(ATTENDANCE_WORK_MODE, {
      message: "Work mode is required (WFO or WFH)",
    }),
    latitude: z
      .number()
      .min(-90, "Latitude must be between -90 and 90")
      .max(90, "Latitude must be between -90 and 90")
      .optional(),
    longitude: z
      .number()
      .min(-180, "Longitude must be between -180 and 180")
      .max(180, "Longitude must be between -180 and 180")
      .optional(),
  })
  .refine(
    (data) => {
      if (data.workMode === ATTENDANCE_WORK_MODE.WFO) {
        return data.latitude !== undefined && data.longitude !== undefined;
      }
      return true;
    },
    {
      message: "Latitude and longitude are required for Work From Office (WFO)",
      path: ["latitude"],
    },
  );

export const attendanceCheckOutSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

// export const attendanceCheckOutSchema = coordinatesSchema;

export type AttendanceCheckInInput = z.infer<typeof attendanceCheckInSchema>;

export type AttendanceCheckOutInput = z.infer<typeof attendanceCheckOutSchema>;

export const attendanceQuerySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
      .optional(),

    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD")
      .optional(),

    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD")
      .optional(),

    employeeId: objectIdSchema.optional(),

    branchId: objectIdSchema.optional(),

    status: z.string().optional(),

    workMode: z.string().optional(),

    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) => {
      if (data.dateFrom && data.dateTo) {
        return data.dateFrom <= data.dateTo;
      }

      return true;
    },
    {
      message: "dateFrom cannot be after dateTo",
      path: ["dateFrom"],
    },
  );

export const attendanceReportSchema = z
  .object({
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD"),

    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD"),

    branchId: objectIdSchema.optional(),

    employeeId: objectIdSchema.optional(),
  })
  .refine((data) => data.dateFrom <= data.dateTo, {
    message: "dateFrom cannot be after dateTo",
    path: ["dateFrom"],
  });
