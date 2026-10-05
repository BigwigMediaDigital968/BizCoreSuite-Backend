import mongoose from "mongoose";

import { LeadFollowUp } from "../models/LeadFollowUp.js";

import { Lead } from "../models/Lead.js";

import { LEAD_ACTIVITY_TYPE } from "../models/LeadActivity.js";

import { LEAD_FOLLOW_UP_STATUS } from "../constants/leadFollowUpStatus.js";

import { AppError } from "../utils/AppError.js";
import { createLeadActivity } from "./lead.service.js";

export const createLeadFollowUp = async ({
  leadId,
  userId,
  scheduledAt,
  remark,
}: {
  leadId: string;
  userId: string;
  scheduledAt: Date;
  remark?: string;
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

  if (!lead.assignedTo) {
    throw new AppError(
      "Lead must be assigned before scheduling a follow-up",
      400,
      "LEAD_NOT_ASSIGNED",
    );
  }

  /*
   * Only the currently assigned employee
   * can create a follow-up.
   */
  if (lead.assignedTo.toString() !== userId) {
    throw new AppError(
      "Only the assigned employee can schedule a follow-up",
      403,
      "FOLLOW_UP_ACCESS_DENIED",
    );
  }

  const followUp = await LeadFollowUp.create({
    lead: lead._id,

    assignedTo: lead.assignedTo,

    createdBy: new mongoose.Types.ObjectId(userId),

    branch: lead.branch,

    scheduledAt,

    remark,

    status: LEAD_FOLLOW_UP_STATUS.PENDING,
  });

  await createLeadActivity({
    leadId: lead._id,

    activityType: LEAD_ACTIVITY_TYPE.FOLLOW_UP,

    performedBy: userId,

    remark,

    metadata: {
      followUpId: followUp._id.toString(),

      scheduledAt: scheduledAt.toISOString(),

      action: "FOLLOW_UP_SCHEDULED",
    },
  });

  return followUp;
};

export const completeLeadFollowUp = async ({
  followUpId,
  userId,
  remark,
}: {
  followUpId: string;
  userId: string;
  remark: string;
}) => {
  if (!mongoose.Types.ObjectId.isValid(followUpId)) {
    throw new AppError("Invalid follow-up ID", 400, "INVALID_FOLLOW_UP_ID");
  }

  const followUp = await LeadFollowUp.findById(followUpId);

  if (!followUp) {
    throw new AppError("Follow-up not found", 404, "FOLLOW_UP_NOT_FOUND");
  }

  if (followUp.status !== LEAD_FOLLOW_UP_STATUS.PENDING) {
    throw new AppError(
      "Follow-up is no longer pending",
      400,
      "FOLLOW_UP_NOT_PENDING",
    );
  }

  if (followUp.assignedTo.toString() !== userId) {
    throw new AppError(
      "You are not assigned to this follow-up",
      403,
      "FOLLOW_UP_ACCESS_DENIED",
    );
  }

  followUp.status = LEAD_FOLLOW_UP_STATUS.COMPLETED;

  followUp.completedAt = new Date();

  followUp.completedBy = new mongoose.Types.ObjectId(userId);

  followUp.remark = remark;

  await followUp.save();

  await createLeadActivity({
    leadId: followUp.lead,

    activityType: LEAD_ACTIVITY_TYPE.FOLLOW_UP,

    performedBy: userId,

    remark,

    metadata: {
      followUpId: followUp._id.toString(),

      action: "FOLLOW_UP_COMPLETED",

      completedAt: followUp.completedAt.toISOString(),
    },
  });

  return followUp;
};

export const getLeadFollowUps = async (leadId: string) => {
  return LeadFollowUp.find({
    lead: leadId,
  })
    .populate("assignedTo", "name email role")
    .populate("completedBy", "name email role")
    .sort({
      scheduledAt: -1,
    })
    .lean();
};

export const getMyPendingFollowUps = async (userId: string) => {
  return LeadFollowUp.find({
    assignedTo: userId,

    status: LEAD_FOLLOW_UP_STATUS.PENDING,
  })
    .populate("lead", "name phone email city status")
    .sort({
      scheduledAt: 1,
    })
    .lean();
};
