import { Request, Response, NextFunction } from "express";
import { logActivity } from "../services/activity.service.js";

// Quick sanity update in src/middleware/auditLogger.middleware.ts
export const trackActivity = (
  module:
    | "LEAD"
    | "LEAD_ACTIVITY"
    | "LEAD_FOLLOWUP"
    | "CALL_LOG"
    | "BRANCH"
    | "HOLIDAY"
    | "USER"
    | "EMPLOYEE"
    | "STRINGEE"
    | "TASK"
    | "ATTENDANCE"
    | "LEAVE"
    | "REVENUE"
    | "REPORT"
    | "DAILY_REPORT"
    | "SALARY"
    | "INTEGRATION"
    | "SYSTEM",
  action: string,
  // May return a Promise so descriptions can look up the human-readable
  // name/email for an id (e.g. req.params.id) instead of logging the raw
  // id — the request/response cycle has already finished by the time this
  // runs (see res.on("finish") below), so the extra lookup adds no latency
  // for the caller.
  getDescription?: (req: Request) => string | Promise<string>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const currentUser = (req as any).user;

        // Ensure userId is present (for login, it gets populated on req.user inside loginController)
        const userId = currentUser?._id || currentUser?.id;
        if (!userId) return;

        (async () => {
          const description = getDescription
            ? await getDescription(req)
            : `${action} on ${req.originalUrl}`;

          await logActivity({
            module,
            action,
            description,
            performedBy: userId,
            branch: currentUser?.branches?.[0],
            ipAddress: req.ip,
            metadata: { ip: req.ip, userAgent: req.get("user-agent") },
          });
        })().catch((error) =>
          console.error("[ACTIVITY_LOG_ERROR]: Failed to build description", error),
        );
      }
    });

    next();
  };
};
