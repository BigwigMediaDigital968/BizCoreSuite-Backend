import { Types } from "mongoose";
import { z } from "zod";
import { v2 as cloudinary } from "cloudinary";
import { Contest } from "../models/Contest.js";
import { Branch } from "../models/Branch.js";
import { uploadToCloudinary } from "../config/cloudinary.js";
import { notify } from "./notification.service.js";
import { ROLES } from "../constants/roles.js";
import { NOTIFICATION_TYPES } from "../models/Notification.js";
import { AppError } from "../utils/AppError.js";
import type { AuthenticatedUser } from "../types/auth.js";

export const createContestSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().min(5),
  branches: z.preprocess(
    (val) => {
      // 1. If sent as JSON array or single value array
      if (Array.isArray(val)) return val;
      // 2. If sent as string (e.g. '["id1", "id2"]' or 'id1,id2' or 'id1')
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // Fallback for comma-separated values: "id1,id2"
          return val.split(",").map((item) => item.trim());
        }
        return [val.trim()];
      }
      return val;
    },
    z.array(z.string()).min(1, "At least one target branch is required"),
  ),
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }),
});

export const createContest = async (
  requestor: AuthenticatedUser,
  bodyData: unknown,
  file?: Express.Multer.File,
) => {
  if (requestor.role !== ROLES.HEAD) {
    throw new AppError(
      "Only Head role can launch contests",
      403,
      "ACCESS_DENIED",
    );
  }

  const parseResult = createContestSchema.safeParse(
    typeof bodyData === "string" ? JSON.parse(bodyData) : bodyData,
  );

  if (!parseResult.success) {
    const errs = parseResult.error.issues.map((i) => i.message).join(", ");
    throw new AppError(`Validation error: ${errs}`, 400, "INVALID_INPUT");
  }

  const { title, description, branches, startDate, endDate } = parseResult.data;

  // Validate branches exist
  const validBranchIds = branches.map((id) => new Types.ObjectId(id));
  const foundBranches = await Branch.find({
    _id: { $in: validBranchIds },
    isActive: true,
  }).select("_id name");
  if (foundBranches.length !== branches.length) {
    throw new AppError(
      "One or more selected branches do not exist",
      404,
      "BRANCH_NOT_FOUND",
    );
  }

  // Upload Media if attached
  let media;
  if (file) {
    const uploaded = await uploadToCloudinary(
      file.buffer,
      "contests",
      file.mimetype,
    );
    media = {
      ...uploaded,
      originalName: file.originalname,
    };
  }

  const contest = await Contest.create({
    title,
    description,
    branches: validBranchIds,
    media,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    createdBy: new Types.ObjectId(requestor.id),
  });

  // Notify employees in targeted branches
  for (const branchId of branches) {
    await notify({
      roles: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN],
      branchId,
      senderId: requestor.id,
      type: NOTIFICATION_TYPES.SYSTEM_ALERT,
      title: "🏆 New Contest Launched!",
      message: `A new contest "${title}" is now active in your branch.`,
      entityId: contest._id,
      entityType: "Contest",
    });
  }

  return contest;
};

export const getActiveContestsForUser = async (
  requestor: AuthenticatedUser,
) => {
  const userBranchId = requestor.branches[0];
  if (!userBranchId) {
    return [];
  }

  const now = new Date();

  // Fetch contests active for the user's branch
  const contests = await Contest.find({
    branches: new Types.ObjectId(userBranchId),
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .sort({ createdAt: -1 })
    .lean();

  return contests;
};

export const getContestById = async (
  contestId: string,
  requestor: AuthenticatedUser,
) => {
  if (!Types.ObjectId.isValid(contestId)) {
    throw new AppError("Invalid contest ID", 400, "INVALID_ID");
  }

  const contest = await Contest.findById(contestId)
    .populate("branches", "name branchCode")
    .populate("createdBy", "name email role");

  if (!contest) {
    throw new AppError("Contest not found", 404, "CONTEST_NOT_FOUND");
  }

  // Head/Admin can view any contest; everyone else only contests targeted
  // at one of their own branches.
  if (requestor.role !== ROLES.HEAD && requestor.role !== ROLES.ADMIN) {
    const contestBranchIds = contest.branches.map((branch) =>
      (branch as unknown as { _id: Types.ObjectId })._id.toString(),
    );
    const requestorBranchIds = requestor.branches.map((id) => id.toString());
    const hasAccess = contestBranchIds.some((id) =>
      requestorBranchIds.includes(id),
    );

    if (!hasAccess) {
      throw new AppError(
        "You do not have access to this contest",
        403,
        "ACCESS_DENIED",
      );
    }
  }

  return contest;
};

export const updateContestSchema = createContestSchema.partial();

export const updateContest = async (
  contestId: string,
  requestor: AuthenticatedUser,
  bodyData: unknown,
  file?: Express.Multer.File,
) => {
  if (requestor.role !== ROLES.HEAD) {
    throw new AppError(
      "Only Head role can update contests",
      403,
      "ACCESS_DENIED",
    );
  }

  if (!Types.ObjectId.isValid(contestId)) {
    throw new AppError("Invalid contest ID", 400, "INVALID_ID");
  }

  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new AppError("Contest not found", 404, "CONTEST_NOT_FOUND");
  }

  const parseResult = updateContestSchema.safeParse(
    typeof bodyData === "string" ? JSON.parse(bodyData) : bodyData,
  );

  if (!parseResult.success) {
    const errs = parseResult.error.issues.map((i) => i.message).join(", ");
    throw new AppError(`Validation error: ${errs}`, 400, "INVALID_INPUT");
  }

  const { title, description, branches, startDate, endDate } = parseResult.data;

  // Validate branches if updated
  if (branches && branches.length > 0) {
    const validBranchIds = branches.map((id) => new Types.ObjectId(id));
    const foundBranches = await Branch.find({
      _id: { $in: validBranchIds },
      isActive: true,
    }).select("_id");

    if (foundBranches.length !== branches.length) {
      throw new AppError(
        "One or more selected branches do not exist",
        404,
        "BRANCH_NOT_FOUND",
      );
    }
    contest.branches = validBranchIds;
  }

  // Handle new media upload & old media cleanup
  if (file) {
    if (contest.media?.publicId) {
      // Delete previous file from Cloudinary
      await cloudinary.uploader.destroy(contest.media.publicId, {
        resource_type: contest.media.resourceType,
      });
    }

    const uploaded = await uploadToCloudinary(
      file.buffer,
      "contests",
      file.mimetype,
    );
    contest.media = {
      ...uploaded,
      originalName: file.originalname,
    };
  }

  if (title) contest.title = title;
  if (description) contest.description = description;
  if (startDate) contest.startDate = new Date(startDate);
  if (endDate) contest.endDate = new Date(endDate);

  await contest.save();
  return contest;
};

export const toggleContestStatus = async (
  contestId: string,
  requestor: AuthenticatedUser,
  isActive: boolean,
) => {
  if (requestor.role !== ROLES.HEAD) {
    throw new AppError(
      "Only Head role can toggle contest status",
      403,
      "ACCESS_DENIED",
    );
  }

  if (!Types.ObjectId.isValid(contestId)) {
    throw new AppError("Invalid contest ID", 400, "INVALID_ID");
  }

  const contest = await Contest.findByIdAndUpdate(
    contestId,
    { isActive },
    { new: true },
  );

  if (!contest) {
    throw new AppError("Contest not found", 404, "CONTEST_NOT_FOUND");
  }

  return contest;
};

export interface GetAllContestsOptions {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  branchId?: string;
}

export const getAllContestsForAdmin = async (
  requestor: AuthenticatedUser,
  options: GetAllContestsOptions = {},
) => {
  if (requestor.role !== ROLES.HEAD && requestor.role !== ROLES.ADMIN) {
    throw new AppError(
      "Only Head or Admin roles can view all contests",
      403,
      "ACCESS_DENIED",
    );
  }

  const { page = 1, limit = 10, search, isActive, branchId } = options;
  const skip = (page - 1) * limit;

  // Dynamic filter query
  const query: Record<string, any> = {};

  if (typeof isActive === "boolean") {
    query.isActive = isActive;
  }

  if (branchId) {
    if (!Types.ObjectId.isValid(branchId)) {
      throw new AppError("Invalid branch ID filter", 400, "INVALID_ID");
    }
    query.branches = new Types.ObjectId(branchId);
  }

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const [contests, total] = await Promise.all([
    Contest.find(query)
      .populate("branches", "name branchCode")
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Contest.countDocuments(query),
  ]);

  return {
    contests,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};
