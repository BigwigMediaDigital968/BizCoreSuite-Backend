import { Types } from "mongoose";
import { Lead } from "../models/Lead.js";
import { User } from "../models/User.js";
import { Branch } from "../models/Branch.js";
import { LEAD_STATUS, type LeadStatus } from "../constants/leadStatus.js";
import { ROLES } from "../constants/roles.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { AppError } from "../utils/AppError.js";
import type { CreateLeadInput } from "../validators/lead.validator.js";
import type { ListLeadQuery } from "../validators/lead.validator.js";
import { LeadActivity, type LeadActivityType } from "../models/LeadActivity.js";
import mongoose from "mongoose";
import { LeadAssignmentHistory } from "../models/LeadAssignmentHistory.js";

export const createLead = async (
  data: CreateLeadInput,
  user: AuthenticatedUser,
) => {
  /**
   * 1. Resolve branch
   */
  let branchId: string | undefined;

  // HEAD can leave a lead unassigned to any branch at creation time — it
  // simply won't be visible to anyone below HEAD until it's later assigned
  // to an employee, at which point assignLead backfills the branch from
  // that employee's own account. ADMIN must still pick one explicitly,
  // since (unlike HEAD) their own branch access is itself branch-scoped.
  if (user.role === ROLES.HEAD || user.role === ROLES.ADMIN) {
    branchId = data.branchId;
  }

  if (user.role === ROLES.MANAGER || user.role === ROLES.EMPLOYEE) {
    if (!user.branches || user.branches.length === 0) {
      throw new AppError(
        "User is not assigned to any branch",
        403,
        "BRANCH_NOT_ASSIGNED",
      );
    }

    branchId = user.branches[0];
  }

  if (!branchId && user.role !== ROLES.HEAD) {
    throw new AppError("Branch is required", 400, "BRANCH_REQUIRED");
  }

  if (branchId) {
    /**
     * 2. Validate ObjectId
     */
    if (!Types.ObjectId.isValid(branchId)) {
      throw new AppError("Invalid branch ID", 400, "INVALID_BRANCH_ID");
    }

    /**
     * 3. Verify branch exists
     */
    const branch = await Branch.findOne({
      _id: branchId,
      isActive: true,
    });

    if (!branch) {
      throw new AppError("Branch not found or inactive", 404, "BRANCH_NOT_FOUND");
    }

    /**
     * 4. Verify user has access to branch
     */
    if (user.role !== ROLES.HEAD) {
      const hasBranchAccess = user.branches?.some(
        (id) => id.toString() === branchId,
      );

      if (!hasBranchAccess) {
        throw new AppError(
          "You do not have access to this branch",
          403,
          "BRANCH_ACCESS_DENIED",
        );
      }
    }
  }

  /**
   * 5. Normalize phone
   */
  const normalizedPhone = data.phone.replace(/\D/g, "");

  /**
   * 6. Duplicate detection — scoped to the branch when there is one;
   * scoped to the branchless pool otherwise, so a Head creating unassigned
   * leads doesn't get blocked by (or collide with) branch-scoped duplicates.
   */
  const existingLead = await Lead.findOne({
    branch: branchId ?? { $exists: false },
    phoneCountryCode: data.phoneCountryCode,
    phone: normalizedPhone,
    isDeleted: false,
  });

  if (existingLead) {
    throw new AppError(
      "A lead with this phone number already exists in this branch",
      409,
      "LEAD_ALREADY_EXISTS",
    );
  }

  /**
   * 7. Automatic Self-Assignment Logic for Employees
   */
  const now = new Date();
  const isEmployee = user.role === ROLES.EMPLOYEE;

  const creatorObjectId = new Types.ObjectId(user.id);
  const assignedTo = isEmployee ? creatorObjectId : undefined;
  const assignedBy = isEmployee ? creatorObjectId : undefined;
  const assignedAt = isEmployee ? now : undefined;

  /**
   * 8. Create Lead
   */
  const lead = await Lead.create({
    name: data.name,
    phoneCountryCode: data.phoneCountryCode,
    phone: normalizedPhone,
    email: data.email || undefined,
    city: data.city || undefined,
    industry: data.industry || undefined,
    message: data.message || undefined,
    remarks: data.remarks || undefined,
    source: data.source,
    sourceType: data.sourceType,
    branch: branchId ? new Types.ObjectId(branchId) : undefined,
    createdBy: creatorObjectId,
    assignedTo,
    assignedBy,
    assignedAt,
    status: LEAD_STATUS.NEW,
    isDeleted: false,
  });

  /**
   * 9. Log Assignment History (If Auto-Assigned)
   */
  if (isEmployee) {
    await LeadAssignmentHistory.create({
      lead: lead._id,
      assignedTo: creatorObjectId,
      assignedBy: creatorObjectId,
      branch: lead.branch,
      assignedAt: now,
    });
  }

  return lead;
};

const buildLeadAccessFilter = (user: AuthenticatedUser) => {
  /**
   * Everyone can only see non-deleted leads.
   */
  const filter: Record<string, unknown> = {
    isDeleted: false,
  };

  /**
   * HEAD
   *
   * Head has global access.
   */
  if (user.role === ROLES.HEAD) {
    return filter;
  }

  /**
   * ADMIN / MANAGER / EMPLOYEE
   *
   * They must have branch access.
   */
  if (!user.branches || user.branches.length === 0) {
    throw new AppError(
      "User is not assigned to any branch",
      403,
      "BRANCH_NOT_ASSIGNED",
    );
  }

  const branchIds = user.branches
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  if (branchIds.length === 0) {
    throw new AppError(
      "User has no valid branch assignments",
      403,
      "INVALID_BRANCH_ASSIGNMENT",
    );
  }

  /**
   * Employee
   *
   * Only assigned leads.
   */
  if (user.role === ROLES.EMPLOYEE) {
    filter.branch = {
      $in: branchIds,
    };

    filter.assignedTo = new Types.ObjectId(user.id);

    return filter;
  }

  /**
   * Admin / Manager
   *
   * Branch-level visibility.
   */
  filter.branch = {
    $in: branchIds,
  };

  return filter;
};

export const listLeads = async (
  user: AuthenticatedUser,
  query: ListLeadQuery,
) => {
  const filter = buildLeadAccessFilter(user);

  /**
   * ---------------------------------------------------------
   * Optional filters
   * ---------------------------------------------------------
   */

  if (query.status) {
    filter.status = query.status;
  }

  if (query.source) {
    filter.source = query.source;
  }

  /**
   * ---------------------------------------------------------
   * Branch filter
   * ---------------------------------------------------------
   *
   * Important:
   *
   * We don't simply trust branchId.
   *
   * It must still exist inside the user's
   * already-authorized branch scope.
   */

  if (query.branchId) {
    const requestedBranch = new Types.ObjectId(query.branchId);

    if (user.role !== ROLES.HEAD) {
      const allowed = user.branches.includes(query.branchId);

      if (!allowed) {
        throw new AppError(
          "You do not have access to this branch",
          403,
          "BRANCH_ACCESS_DENIED",
        );
      }
    }

    filter.branch = requestedBranch;
  }

  /**
   * ---------------------------------------------------------
   * Employee filter
   * ---------------------------------------------------------
   */

  if (query.assignedTo) {
    const requestedEmployee = new Types.ObjectId(query.assignedTo);

    /**
     * Employee cannot change assignedTo
     * through query parameters.
     */

    if (user.role === ROLES.EMPLOYEE) {
      if (query.assignedTo !== user.id) {
        throw new AppError(
          "Employees can only view their assigned leads",
          403,
          "LEAD_ACCESS_DENIED",
        );
      }
    }

    filter.assignedTo = requestedEmployee;
  }

  /**
   * ---------------------------------------------------------
   * Search
   * ---------------------------------------------------------
   */

  if (query.search) {
    const escapedSearch = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const searchRegex = new RegExp(escapedSearch, "i");

    filter.$or = [
      {
        name: searchRegex,
      },
      {
        phone: searchRegex,
      },
      {
        email: searchRegex,
      },
      {
        city: searchRegex,
      },
      {
        industry: searchRegex,
      },
    ];
  }

  /**
   * ---------------------------------------------------------
   * Date filters
   * ---------------------------------------------------------
   */

  if (query.fromDate || query.toDate) {
    const createdAt: Record<string, Date> = {};

    if (query.fromDate) {
      createdAt.$gte = new Date(query.fromDate);
    }

    if (query.toDate) {
      createdAt.$lte = new Date(query.toDate);
    }

    filter.createdAt = createdAt;
  }

  /**
   * ---------------------------------------------------------
   * Pagination
   * ---------------------------------------------------------
   */

  const page = query.page;

  const limit = query.limit;

  const skip = (page - 1) * limit;

  /**
   * ---------------------------------------------------------
   * Sorting
   * ---------------------------------------------------------
   */

  const sortDirection = query.sortOrder === "asc" ? 1 : -1;

  const sort = {
    [query.sortBy]: sortDirection,
  } as Record<string, 1 | -1>;

  /**
   * ---------------------------------------------------------
   * Query
   * ---------------------------------------------------------
   */

  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .populate("branch", "name code")
      .populate("assignedTo", "name email role")
      .populate("createdBy", "name email role")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),

    Lead.countDocuments(filter),
  ]);

  /**
   * ---------------------------------------------------------
   * Pagination metadata
   * ---------------------------------------------------------
   */

  const totalPages = Math.ceil(total / limit);

  return {
    leads,

    pagination: {
      page,
      limit,
      total,
      totalPages,

      hasNextPage: page < totalPages,

      hasPreviousPage: page > 1,
    },
  };
};

export const getLeadById = async (leadId: string, user: AuthenticatedUser) => {
  if (!Types.ObjectId.isValid(leadId)) {
    throw new AppError("Invalid lead ID", 400, "INVALID_LEAD_ID");
  }

  const filter = buildLeadAccessFilter(user);

  filter._id = new Types.ObjectId(leadId);

  const lead = await Lead.findOne(filter)
    .populate("branch", "name code")
    .populate("assignedTo", "name email role")
    .populate("createdBy", "name email role")
    .lean();

  if (!lead) {
    /**
     * We intentionally return NOT_FOUND
     * rather than revealing whether the
     * lead exists in another branch.
     */
    throw new AppError("Lead not found", 404, "LEAD_NOT_FOUND");
  }

  return lead;
};

export const updateLeadStatus = async ({
  leadId,
  status,
  remark,
  userId,
}: {
  leadId: string;
  status: string;
  remark?: string;
  userId: string;
}) => {
  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new AppError("Invalid lead ID", 400, "INVALID_LEAD_ID");
  }

  const lead = await Lead.findOne({
    _id: leadId,
    isDeleted: false,
  });

  if (!lead) {
    throw new AppError("Lead not found", 404, "LEAD_NOT_FOUND");
  }

  const previousStatus = lead.status;

  if (previousStatus === status && !remark) {
    throw new AppError("Lead already has this status", 400, "STATUS_UNCHANGED");
  }

  lead.status = status as typeof lead.status;

  if (remark) {
    lead.remarks = remark;
  }

  await lead.save();

  await createLeadActivity({
    leadId: lead._id,
    activityType: "status_changed",
    performedBy: userId,
    previousStatus,
    newStatus: status,
    remark,
  });

  return lead;
};

export const addLeadRemark = async ({
  leadId,
  remark,
  userId,
}: {
  leadId: string;
  remark: string;
  userId: string;
}) => {
  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new AppError("Invalid lead ID", 400, "INVALID_LEAD_ID");
  }

  const lead = await Lead.findOne({
    _id: leadId,
    isDeleted: false,
  });

  if (!lead) {
    throw new AppError("Lead not found", 404, "LEAD_NOT_FOUND");
  }

  lead.remarks = remark;

  await lead.save();

  await createLeadActivity({
    leadId: lead._id,

    activityType: "remark_added",

    performedBy: userId,

    remark,
  });

  return lead;
};

export const getLeadActivities = async (leadId: string) => {
  return LeadActivity.find({
    lead: leadId,
  })
    .populate("performedBy", "name email role")
    .sort({
      createdAt: -1,
    })
    .lean();
};

export const createLeadActivity = async ({
  leadId,
  activityType,
  performedBy,
  previousStatus,
  newStatus,
  remark,
  metadata,
}: {
  leadId: string | mongoose.Types.ObjectId;

  activityType: LeadActivityType;

  performedBy: string | mongoose.Types.ObjectId;

  previousStatus?: string;

  newStatus?: string;

  remark?: string;

  metadata?: Record<string, unknown>;
}) => {
  return LeadActivity.create({
    lead:
      typeof leadId === "string" ? new mongoose.Types.ObjectId(leadId) : leadId,

    activityType,

    performedBy:
      typeof performedBy === "string"
        ? new mongoose.Types.ObjectId(performedBy)
        : performedBy,

    previousStatus,

    newStatus,

    remark,

    metadata,
  });
};
