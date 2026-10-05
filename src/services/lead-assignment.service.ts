import mongoose from "mongoose";
import { LeadAssignmentHistory } from "../models/LeadAssignmentHistory.js";
import { Lead } from "../models/Lead.js";
import { User } from "../models/User.js";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { Branch } from "../models/Branch.js";
import { ROLES } from "../constants/roles.js";
import { AppError } from "../utils/AppError.js";
import { EMPLOYMENT_STATUS, EmploymentStatus } from "../constants/employee.js";

/**
 * Validates that the provided ID belongs to an existing, active EmployeeProfile
 * and returns the underlying active User document.
 */
const resolveEmployeeProfile = async (employeeProfileId: string) => {
  if (!mongoose.Types.ObjectId.isValid(employeeProfileId)) {
    throw new AppError(
      "Invalid Employee Profile ID format",
      400,
      "INVALID_EMPLOYEE_ID",
    );
  }

  // 1. Check if the profile exists in EmployeeProfile
  const profileDoc = await EmployeeProfile.findById(employeeProfileId).lean();
  if (!profileDoc) {
    throw new AppError("Employee does not exist", 404, "EMPLOYEE_NOT_EXISTS");
  }

  // Define invalid employment statuses for lead assignment
  const DISALLOWED_STATUSES: EmploymentStatus[] = [
    EMPLOYMENT_STATUS.TERMINATED,
    EMPLOYMENT_STATUS.RESIGNED,
    EMPLOYMENT_STATUS.INACTIVE,
  ];

  if (DISALLOWED_STATUSES.includes(profileDoc.employmentStatus)) {
    throw new AppError(
      `Cannot assign leads to an employee with status '${profileDoc.employmentStatus}'`,
      400,
      "EMPLOYEE_INACTIVE",
    );
  }

  // 3. Fetch the linked User record to verify role and system access
  const user = await User.findOne({ _id: profileDoc.user, isActive: true })
    .select("_id name email role branches isActive")
    .lean();

  if (!user) {
    throw new AppError(
      "Linked user account is inactive or missing",
      400,
      "USER_ACCOUNT_UNAVAILABLE",
    );
  }

  if (user.role !== ROLES.EMPLOYEE) {
    throw new AppError(
      "Lead can only be assigned to a user with the EMPLOYEE role",
      400,
      "INVALID_ASSIGNMENT_TARGET",
    );
  }

  return user;
};

/**
 * Resolves which branch an assignment should land on: an explicit
 * branchId (chosen by the assigner) always wins — this is what lets an
 * assignment move a lead to a different branch — falling back to the
 * target employee's own branch when no branchId was given.
 */
const resolveTargetBranchId = async ({
  branchId,
  targetUser,
}: {
  branchId?: string;
  targetUser: Awaited<ReturnType<typeof resolveEmployeeProfile>> | null;
}) => {
  let targetBranchId = branchId;

  if (!targetBranchId) {
    if (!targetUser) {
      // Unreachable: callers guarantee employeeId or branchId is present.
      throw new AppError("A branch is required", 400, "BRANCH_REQUIRED");
    }
    if (targetUser.branches.length === 0) {
      throw new AppError(
        "This employee has no branch to assign the lead to",
        400,
        "EMPLOYEE_BRANCH_REQUIRED",
      );
    }
    targetBranchId = targetUser.branches[0]!.toString();
  }

  if (!mongoose.Types.ObjectId.isValid(targetBranchId)) {
    throw new AppError("Invalid branch ID format", 400, "INVALID_BRANCH_ID");
  }

  const branch = await Branch.findById(targetBranchId).select("_id").lean();
  if (!branch) {
    throw new AppError("Branch not found", 404, "BRANCH_NOT_FOUND");
  }

  // The employee must belong to the branch the lead is landing on —
  // otherwise the lead becomes permanently invisible to them, since the
  // read-side access filter requires branch AND assignedTo to both match
  // for the EMPLOYEE role.
  if (targetUser) {
    const employeeBelongsToBranch = targetUser.branches.some(
      (b) => b.toString() === targetBranchId,
    );
    if (!employeeBelongsToBranch) {
      throw new AppError(
        "Employee does not belong to the selected branch",
        403,
        "CROSS_BRANCH_ASSIGNMENT",
      );
    }
  }

  return targetBranchId;
};

// Single Assignment Service
export const assignLead = async ({
  leadId,
  employeeId,
  branchId,
  actorId,
}: {
  leadId: string;
  employeeId?: string;
  branchId?: string;
  actorId: string;
}) => {
  if (!employeeId && !branchId) {
    throw new AppError(
      "Either an employee or a branch is required to assign a lead",
      400,
      "ASSIGNMENT_TARGET_REQUIRED",
    );
  }

  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new AppError("Invalid lead ID", 400, "INVALID_LEAD_ID");
  }

  // Resolve the EmployeeProfile ID to get the linked active User. Absent
  // for a branch-only assignment (no specific representative).
  const targetUser = employeeId
    ? await resolveEmployeeProfile(employeeId)
    : null;

  const lead = await Lead.findOne({ _id: leadId, isDeleted: false });
  if (!lead) {
    throw new AppError("Lead not found", 404, "LEAD_NOT_FOUND");
  }

  const actor = await User.findById(actorId)
    .select("_id role branches isActive")
    .lean();
  if (!actor) {
    throw new AppError("Assigning user not found", 401, "ACTOR_NOT_FOUND");
  }
  if (!actor.isActive) {
    throw new AppError("Your account is inactive", 403, "ACCOUNT_INACTIVE");
  }

  const isHead = actor.role === ROLES.HEAD;

  const targetBranchId = await resolveTargetBranchId({ branchId, targetUser });

  // Only non-HEAD actors need their own branch access checked — HEAD has
  // access to every branch.
  if (!isHead) {
    const actorHasBranchAccess = actor.branches.some(
      (branch) => branch.toString() === targetBranchId,
    );
    if (!actorHasBranchAccess) {
      throw new AppError(
        "You do not have access to this branch",
        403,
        "BRANCH_ACCESS_DENIED",
      );
    }
  }

  const previousAssignee = lead.assignedTo || undefined;
  const now = new Date();

  lead.branch = new mongoose.Types.ObjectId(targetBranchId);
  lead.assignedBy = new mongoose.Types.ObjectId(actorId);
  lead.assignedAt = now;
  // Assign using the User ID linked to the EmployeeProfile, or clear any
  // existing representative for a branch-only assignment.
  lead.assignedTo = targetUser ? targetUser._id : undefined;

  await lead.save();

  await LeadAssignmentHistory.create({
    lead: lead._id,
    assignedTo: targetUser ? targetUser._id : undefined,
    assignedBy: new mongoose.Types.ObjectId(actorId),
    branch: lead.branch,
    previousAssignee,
    assignedAt: now,
  });

  // The controller hands this document straight back to the client, which
  // replaces its cached lead detail with it — populate the same refs the
  // GET /leads/:id route does, or branch/assignedTo/createdBy would regress
  // to bare ObjectIds and read back as "Unassigned" until the next refetch.
  await lead.populate([
    { path: "branch", select: "name code" },
    { path: "assignedTo", select: "name email role" },
    { path: "createdBy", select: "name email role" },
  ]);

  // Returned separately from `lead` since `lead.branch` is now a populated
  // document, not the bare ObjectId string callers (e.g. the audit log)
  // need.
  return { lead, branchId: targetBranchId };
};

// Bulk Assignment Service
export const assignLeadsBulk = async ({
  leadIds,
  employeeId,
  branchId,
  actorId,
}: {
  leadIds: string[];
  employeeId?: string;
  branchId?: string;
  actorId: string;
}) => {
  if (!employeeId && !branchId) {
    throw new AppError(
      "Either an employee or a branch is required to assign leads",
      400,
      "ASSIGNMENT_TARGET_REQUIRED",
    );
  }

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    throw new AppError(
      "Lead IDs must be a non-empty array",
      400,
      "INVALID_LEAD_IDS",
    );
  }

  const validLeadIds = leadIds.filter((id) =>
    mongoose.Types.ObjectId.isValid(id),
  );
  if (validLeadIds.length !== leadIds.length) {
    throw new AppError(
      "One or more Lead IDs are invalid",
      400,
      "INVALID_LEAD_IDS",
    );
  }

  // Resolve the EmployeeProfile ID to get the linked active User. Absent
  // for a branch-only assignment (no specific representative).
  const targetUser = employeeId
    ? await resolveEmployeeProfile(employeeId)
    : null;

  const actor = await User.findById(actorId)
    .select("_id role branches isActive")
    .lean();
  if (!actor || !actor.isActive) {
    throw new AppError(
      "Assigning user is invalid or inactive",
      403,
      "UNAUTHORIZED_ACTOR",
    );
  }

  const isHead = actor.role === ROLES.HEAD;

  const targetBranchId = await resolveTargetBranchId({ branchId, targetUser });

  if (!isHead) {
    const actorHasAccess = actor.branches.some(
      (b) => b.toString() === targetBranchId,
    );
    if (!actorHasAccess) {
      throw new AppError(
        "You do not have access to this branch",
        403,
        "BRANCH_ACCESS_DENIED",
      );
    }
  }

  const leads = await Lead.find({
    _id: { $in: validLeadIds },
    isDeleted: false,
  });
  if (leads.length === 0) {
    throw new AppError(
      "No valid leads found for assignment",
      404,
      "LEADS_NOT_FOUND",
    );
  }

  const now = new Date();
  const targetBranchObjectId = new mongoose.Types.ObjectId(targetBranchId);
  const bulkOps = [];
  const historyDocs = [];

  for (const lead of leads) {
    const setFields: Record<string, unknown> = {
      assignedBy: new mongoose.Types.ObjectId(actorId),
      assignedAt: now,
      branch: targetBranchObjectId,
    };
    const unsetFields: Record<string, "" | 1 | true> = {};

    if (targetUser) {
      setFields.assignedTo = targetUser._id; // Assign to the linked User ID
    } else {
      unsetFields.assignedTo = "";
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: lead._id },
        update: {
          $set: setFields,
          ...(Object.keys(unsetFields).length
            ? { $unset: unsetFields }
            : {}),
        },
      },
    });

    historyDocs.push({
      lead: lead._id,
      assignedTo: targetUser ? targetUser._id : undefined,
      assignedBy: new mongoose.Types.ObjectId(actorId),
      branch: targetBranchObjectId,
      previousAssignee: lead.assignedTo || undefined,
      assignedAt: now,
    });
  }

  await Lead.bulkWrite(bulkOps);
  await LeadAssignmentHistory.insertMany(historyDocs);

  return { assignedCount: leads.length, leadIds: leads.map((l) => l._id) };
};
