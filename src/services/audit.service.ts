import mongoose from "mongoose";

import { AuditLog } from "../models/AuditLog.js";
import type { AuditAction } from "../constants/auditActions.js";
import type { AuditEntity } from "../constants/auditEntities.js";
import type { AuditLogQuery } from "../validators/audit.validator.js";
import { AppError } from "../utils/AppError.js";

interface CreateAuditLogInput {
  actor: string;

  action: AuditAction;

  entity: AuditEntity;

  entityId?: string;

  branch?: string;

  metadata?: Record<string, unknown>;

  ipAddress?: string;

  userAgent?: string;
}

export const createAuditLog = async (data: CreateAuditLogInput) => {
  return AuditLog.create({
    actor: new mongoose.Types.ObjectId(data.actor),

    action: data.action,

    entity: data.entity,

    entityId: data.entityId
      ? new mongoose.Types.ObjectId(data.entityId)
      : undefined,

    branch: data.branch ? new mongoose.Types.ObjectId(data.branch) : undefined,

    metadata: data.metadata ?? {},

    ipAddress: data.ipAddress,

    userAgent: data.userAgent,
  });
};

export const getAuditLogs = async (
  query: AuditLogQuery,
  allowedBranchIds?: string[],
) => {
  const {
    page,
    limit,
    action,
    entity,
    actor,
    entityId,
    branch,
    from,
    to,
    sortOrder,
  } = query;

  const filter: Record<string, unknown> = {};

  if (action) {
    filter.action = action;
  }

  if (entity) {
    filter.entity = entity;
  }

  if (actor) {
    filter.actor = actor;
  }

  if (entityId) {
    filter.entityId = entityId;
  }

  if (branch) {
    filter.branch = branch;
  }

  if (from || to) {
    filter.createdAt = {};

    if (from) {
      (filter.createdAt as Record<string, Date>).$gte = new Date(from);
    }

    if (to) {
      (filter.createdAt as Record<string, Date>).$lte = new Date(to);
    }
  }

  if (allowedBranchIds && allowedBranchIds.length > 0) {
    if (branch) {
      if (!allowedBranchIds.includes(branch)) {
        throw new AppError(
          "You do not have access to this branch",
          403,
          "BRANCH_ACCESS_DENIED",
        );
      }

      filter.branch = branch;
    } else {
      filter.branch = {
        $in: allowedBranchIds,
      };
    }
  }

  const skip = (page - 1) * limit;

  const sort = sortOrder === "asc" ? 1 : -1;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate("actor", "_id name email role")
      .populate("branch", "_id name code")
      .sort({
        createdAt: sort,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    AuditLog.countDocuments(filter),
  ]);

  return {
    logs,

    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};
