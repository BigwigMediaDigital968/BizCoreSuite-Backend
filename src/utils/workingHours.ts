import { Branch } from "../models/Branch.js";

/**
 * Checks whether the current time in the branch's timezone falls outside configured working hours.
 */
export const isAfterWorkingHours = async (
  branchId: string,
): Promise<boolean> => {
  const branch = await Branch.findById(branchId).lean();
  if (!branch || !branch.attendanceConfig?.enabled) return false;

  const timezone = branch.attendanceConfig.timezone || "Asia/Kolkata";
  const { endTime } = branch.attendanceConfig.workingHours; // e.g., "19:00"

  // Get current time string in the branch's local timezone (HH:mm format)
  const nowInBranchTz = new Date().toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  return nowInBranchTz > endTime;
};

/**
 * Normalizes date to UTC 00:00:00 for strict per-day comparisons.
 */
export const getUtcNormalizedDate = (dateString?: string): Date => {
  const d = dateString ? new Date(dateString) : new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
};
