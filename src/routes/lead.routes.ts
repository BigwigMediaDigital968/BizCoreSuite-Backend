import { Router } from "express";

import {
  createLeadController,
  getLeadCallLogs,
  listLeadsController,
  getLeadController,
  updateLeadStatusController,
  addLeadRemarkController,
  getLeadActivitiesController,
} from "../controllers/lead.controller.js";

import {
  createLeadFollowUpController,
  completeLeadFollowUpController,
  getLeadFollowUpsController,
  getMyPendingFollowUpsController,
} from "../controllers/lead-followup.controller.js";

import {
  assignLeadController,
  bulkAssignLeadsController,
} from "../controllers/lead-assignment.controller.js";

import { importLeadsController } from "../controllers/lead-import.controller.js";
import {
  getLeadMessages,
  getLeadTemplates,
  postLeadMessage,
} from "../controllers/integration.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { leadExcelUpload } from "../middleware/upload.middleware.js";
import { requireBranchAccess } from "../middleware/branch.middleware.js";

const router = Router();

// 1. CREATE LEAD
router.post(
  "/",
  authenticate,
  authorize(PERMISSIONS.LEAD_CREATE),
  trackActivity(
    "LEAD",
    "CREATED",
    (req) =>
      `Created new lead: ${req.body?.name || req.body?.phone || "Unnamed Lead"}`,
  ),
  createLeadController,
);

// 2. READ / LIST LEADS & CALL LOGS
router.get(
  "/:leadId/calls",
  authenticate,
  authorize(PERMISSIONS.CALL_LOG_VIEW),
  getLeadCallLogs,
);

router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.LEAD_VIEW),
  listLeadsController,
);

router.get(
  "/my/follow-ups",
  authenticate,
  authorize(PERMISSIONS.LEAD_VIEW),
  getMyPendingFollowUpsController,
);

// 3. LEAD FOLLOW-UPS
router.post(
  "/:id/follow-ups",
  authenticate,
  authorize(PERMISSIONS.LEAD_UPDATE),
  trackActivity(
    "LEAD_FOLLOWUP",
    "CREATED",
    (req) => `Created follow-up for lead ID: ${req.params.id}`,
  ),
  createLeadFollowUpController,
);

router.get(
  "/:id/follow-ups",
  authenticate,
  authorize(PERMISSIONS.LEAD_VIEW),
  getLeadFollowUpsController,
);

router.patch(
  "/follow-ups/:followUpId/complete",
  authenticate,
  authorize(PERMISSIONS.LEAD_UPDATE),
  trackActivity(
    "LEAD_FOLLOWUP",
    "COMPLETED",
    (req) => `Completed follow-up ID: ${req.params.followUpId}`,
  ),
  completeLeadFollowUpController,
);

// 4. READ LEAD DETAILS & ACTIVITIES
router.get(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.LEAD_VIEW),
  getLeadController,
);

router.get(
  "/:id/activities",
  authenticate,
  authorize(PERMISSIONS.LEAD_VIEW),
  getLeadActivitiesController,
);

// 5. LEAD ASSIGNMENTS
router.patch(
  "/:id/assign",
  authenticate,
  authorize(PERMISSIONS.LEAD_ASSIGN),
  trackActivity(
    "LEAD",
    "ASSIGNED",
    (req) =>
      `Assigned lead ID: ${req.params.id} to user: ${req.body?.assignedTo || req.body?.userId}`,
  ),
  assignLeadController,
);

router.patch(
  "/bulk-assign",
  authenticate,
  authorize(PERMISSIONS.LEAD_ASSIGN),
  trackActivity(
    "LEAD",
    "BULK_ASSIGNED",
    (req) => `Bulk assigned ${req.body?.leadIds?.length || 0} leads`,
  ),
  bulkAssignLeadsController,
);

// 6. UPDATE LEAD STATUS & REMARKS
router.patch(
  "/:id/status",
  authenticate,
  authorize(PERMISSIONS.LEAD_UPDATE),
  trackActivity(
    "LEAD",
    "STATUS_UPDATED",
    (req) =>
      `Updated status for lead ID: ${req.params.id} to '${req.body?.status}'`,
  ),
  updateLeadStatusController,
);

router.post(
  "/:id/remarks",
  authenticate,
  authorize(PERMISSIONS.LEAD_UPDATE),
  trackActivity(
    "LEAD_ACTIVITY",
    "REMARK_ADDED",
    (req) => `Added remark to lead ID: ${req.params.id}`,
  ),
  addLeadRemarkController,
);

// 7. IMPORT LEADS
router.post(
  "/import",
  authenticate,
  authorize(PERMISSIONS.LEAD_CREATE),
  leadExcelUpload.single("file"),
  requireBranchAccess((req) =>
    typeof req.body?.branchId === "string" ? req.body.branchId : undefined,
  ),
  trackActivity(
    "LEAD",
    "IMPORTED",
    (req) =>
      `Imported bulk leads file: ${req.file?.originalname || "Excel file"}`,
  ),
  importLeadsController,
);

// WHATSAPP ON A LEAD
// Access is the lead's own: the service loads the lead through getLeadById,
// so an employee only reaches chats of leads assigned to them.
router.get(
  "/:id/messages",
  authenticate,
  authorize(PERMISSIONS.LEAD_VIEW),
  getLeadMessages,
);

router.get(
  "/:id/messages/templates",
  authenticate,
  authorize(PERMISSIONS.LEAD_MESSAGE_SEND),
  getLeadTemplates,
);

router.post(
  "/:id/messages",
  authenticate,
  authorize(PERMISSIONS.LEAD_MESSAGE_SEND),
  postLeadMessage,
);

export default router;
