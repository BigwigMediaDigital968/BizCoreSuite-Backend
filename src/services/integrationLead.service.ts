import { Types } from "mongoose";

import { getAdapter, isSupportedProvider } from "../integrations/index.js";
import type { NormalizedEvent } from "../integrations/types.js";
import { Integration, type IIntegration } from "../models/Integration.js";
import { IntegrationEvent } from "../models/IntegrationEvent.js";
import { Lead, LEAD_SOURCE_TYPE, type ILead } from "../models/Lead.js";
import { LeadAssignmentHistory } from "../models/LeadAssignmentHistory.js";
import { LEAD_ACTIVITY_TYPE } from "../models/LeadActivity.js";
import { LeadMessage } from "../models/LeadMessage.js";
import { NOTIFICATION_TYPES } from "../models/Notification.js";
import { User } from "../models/User.js";
import {
  INTEGRATION_ASSIGNMENT,
  INTEGRATION_EVENT_OUTCOME,
  INTEGRATION_MAX_CONSECUTIVE_FAILURES,
  INTEGRATION_STATUS,
  LEAD_MESSAGE_DIRECTION,
  LEAD_MESSAGE_STATUS,
  type IntegrationEventOutcome,
  type LeadMessageStatus,
} from "../constants/integration.js";
import { LEAD_STATUS } from "../constants/leadStatus.js";
import { ROLES } from "../constants/roles.js";
import { createLeadActivity } from "./lead.service.js";
import { notify } from "./notification.service.js";
import { getIO } from "../socket/index.js";
import { decryptSecret, safeEqual } from "../utils/crypto.js";
import { splitInternationalNumber } from "../utils/phone.js";
import type { ProviderCredentials } from "../integrations/types.js";

type IntegrationDoc = IIntegration & { _id: Types.ObjectId };

export const loadCredentials = (integration: { credentialsEncrypted?: string }): ProviderCredentials => {
  if (!integration.credentialsEncrypted) {
    throw new Error("Integration credentials weren't loaded");
  }
  return JSON.parse(decryptSecret(integration.credentialsEncrypted)) as ProviderCredentials;
};

const preview = (text: string | null | undefined, max = 120) => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** Live refresh for whoever has the lead open. */
const emitLeadMessage = (lead: Pick<ILead, "_id" | "assignedTo">, messageId: Types.ObjectId) => {
  const io = getIO();
  if (!io) return;
  const payload = { leadId: lead._id.toString(), messageId: messageId.toString() };
  if (lead.assignedTo) io.to(`user:${lead.assignedTo.toString()}`).emit("LEAD_MESSAGE", payload);
  io.to(`role:${ROLES.MANAGER}`).to(`role:${ROLES.ADMIN}`).to(`role:${ROLES.HEAD}`).emit("LEAD_MESSAGE", payload);
};

/** The lead's owner, or — for an unassigned lead — its branch managers and Head. */
const notifyLeadAudience = async (
  lead: Pick<ILead, "_id" | "assignedTo" | "branch">,
  type: (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES],
  title: string,
  message: string,
) => {
  const base = { type, title, message, entityId: lead._id, entityType: "Lead" };
  if (lead.assignedTo) {
    await notify({ ...base, userIds: [lead.assignedTo] });
    return;
  }
  if (lead.branch) {
    await notify({ ...base, roles: [ROLES.MANAGER], branchId: lead.branch });
  }
  await notify({ ...base, roles: [ROLES.HEAD] });
};

// =========================================================================
// Lead matching, creation and assignment
// =========================================================================

const pickAssignee = async (integration: IntegrationDoc): Promise<{
  userId: Types.ObjectId | null;
  branchId: Types.ObjectId | null;
}> => {
  const { routing } = integration;
  const branchId = routing.branch ?? null;

  if (routing.assignment === INTEGRATION_ASSIGNMENT.FIXED_USER && routing.fixedUser) {
    const user = await User.findOne({ _id: routing.fixedUser, isActive: true })
      .select("_id branches")
      .lean();
    if (user) {
      return {
        userId: user._id as Types.ObjectId,
        branchId: branchId ?? ((user.branches?.[0] as Types.ObjectId | undefined) ?? null),
      };
    }
    return { userId: null, branchId };
  }

  if (routing.assignment === INTEGRATION_ASSIGNMENT.ROUND_ROBIN && branchId) {
    const employees = await User.find({ role: ROLES.EMPLOYEE, isActive: true, branches: branchId })
      .select("_id")
      .sort({ _id: 1 })
      .lean();
    if (employees.length) {
      // $inc is atomic, so two leads arriving together get different people.
      const updated = await Integration.findByIdAndUpdate(
        integration._id,
        { $inc: { "routing.roundRobinCursor": 1 } },
        { returnDocument: "before" },
      )
        .select("routing.roundRobinCursor")
        .lean();
      const cursor = updated?.routing?.roundRobinCursor ?? 0;
      return { userId: employees[cursor % employees.length]!._id as Types.ObjectId, branchId };
    }
  }

  return { userId: null, branchId };
};

interface ResolvedLead {
  lead: ILead & { _id: Types.ObjectId };
  created: boolean;
}

/**
 * Finds the lead for a WhatsApp contact, or creates one when allowed.
 * Matching ignores branches: a number that's already a lead anywhere is
 * attached to that lead rather than duplicated.
 */
export const resolveLeadForContact = async (
  integration: IntegrationDoc,
  contactId: string,
  options: { name: string | null; firstText?: string | null; allowCreate: boolean; silent?: boolean },
): Promise<ResolvedLead | null> => {
  const phone = splitInternationalNumber(contactId);

  const or: Record<string, unknown>[] = [{ integration: integration._id, externalId: contactId }];
  if (phone) or.push({ phoneCountryCode: phone.phoneCountryCode, phone: phone.phone });

  const existing = await Lead.findOne({ isDeleted: false, $or: or }).sort({ createdAt: 1 });
  if (existing) {
    if (!existing.integration) {
      existing.integration = integration._id;
      await existing.save();
    }
    return { lead: existing as ResolvedLead["lead"], created: false };
  }

  if (!options.allowCreate) return null;
  if (!phone) {
    throw new Error(`Couldn't read the phone number "${contactId}"`);
  }

  const { userId, branchId } = await pickAssignee(integration);
  const now = new Date();
  const name = (options.name ?? "").trim() || `WhatsApp ${phone.e164}`;

  const lead = await Lead.create({
    name: name.slice(0, 150),
    phoneCountryCode: phone.phoneCountryCode,
    phone: phone.phone,
    message: options.firstText ? options.firstText.slice(0, 5000) : undefined,
    source: integration.leadDefaults?.sourceLabel || "WATI",
    sourceType: LEAD_SOURCE_TYPE.INTEGRATION,
    externalId: contactId,
    integration: integration._id,
    branch: branchId ?? undefined,
    createdBy: integration.createdBy,
    assignedTo: userId ?? undefined,
    assignedBy: userId ? integration.createdBy : undefined,
    assignedAt: userId ? now : undefined,
    status: LEAD_STATUS.NEW,
    isDeleted: false,
  });

  await createLeadActivity({
    leadId: lead._id as Types.ObjectId,
    activityType: LEAD_ACTIVITY_TYPE.CREATED,
    performedBy: integration.createdBy,
    remark: `Created from ${integration.name}`,
    metadata: { integration: integration._id.toString(), provider: integration.provider },
  });

  if (userId) {
    await LeadAssignmentHistory.create({
      lead: lead._id,
      assignedTo: userId,
      assignedBy: integration.createdBy,
      branch: lead.branch,
      assignedAt: now,
    });
    await createLeadActivity({
      leadId: lead._id as Types.ObjectId,
      activityType: LEAD_ACTIVITY_TYPE.ASSIGNED,
      performedBy: integration.createdBy,
      remark: `Auto-assigned by ${integration.name}`,
    });
  }

  await Integration.updateOne({ _id: integration._id }, { $inc: { "stats.leadsCreated": 1 } });

  if (!options.silent) {
    await notifyLeadAudience(
      lead,
      NOTIFICATION_TYPES.INTEGRATION_LEAD_CREATED,
      "New WhatsApp lead",
      `${lead.name} (${phone.e164}) came in through ${integration.name}${userId ? " and is assigned to you" : ""}.`,
    );
  }

  return { lead: lead as ResolvedLead["lead"], created: true };
};

// =========================================================================
// Messages and delivery status
// =========================================================================

const STATUS_RANK: Record<LeadMessageStatus, number> = {
  received: 0,
  pending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
};

const findOwnMessage = async (ids: {
  providerMessageId: string | null;
  externalMessageId: string | null;
  localMessageId: string | null;
}) => {
  const or: Record<string, unknown>[] = [];
  if (ids.providerMessageId) or.push({ providerMessageId: ids.providerMessageId });
  if (ids.externalMessageId) or.push({ externalMessageId: ids.externalMessageId });
  if (ids.localMessageId && Types.ObjectId.isValid(ids.localMessageId)) {
    or.push({ _id: new Types.ObjectId(ids.localMessageId) });
  }
  return or.length ? LeadMessage.findOne({ $or: or }) : null;
};

type ProcessResult = { outcome: IntegrationEventOutcome; leadId?: Types.ObjectId | null };

const processEvent = async (
  integration: IntegrationDoc,
  event: Exclude<NormalizedEvent, { kind: "ignored" }>,
): Promise<ProcessResult> => {
  if (event.kind === "contact") {
    const resolved = await resolveLeadForContact(integration, event.contactId, {
      name: event.name,
      allowCreate: integration.createLeadOn?.newContact !== false,
    });
    if (!resolved) return { outcome: INTEGRATION_EVENT_OUTCOME.IGNORED };
    return {
      outcome: resolved.created ? INTEGRATION_EVENT_OUTCOME.LEAD_CREATED : INTEGRATION_EVENT_OUTCOME.LEAD_MATCHED,
      leadId: resolved.lead._id,
    };
  }

  if (event.kind === "message_in") {
    const resolved = await resolveLeadForContact(integration, event.contactId, {
      name: event.name,
      firstText: event.text,
      allowCreate: integration.createLeadOn?.messageFromUnknown !== false,
    });
    if (!resolved) return { outcome: INTEGRATION_EVENT_OUTCOME.IGNORED };
    const { lead } = resolved;

    if (event.providerMessageId && (await LeadMessage.exists({ providerMessageId: event.providerMessageId }))) {
      return { outcome: INTEGRATION_EVENT_OUTCOME.IGNORED, leadId: lead._id };
    }

    const message = await LeadMessage.create({
      lead: lead._id,
      integration: integration._id,
      direction: LEAD_MESSAGE_DIRECTION.IN,
      type: event.messageType,
      text: event.text,
      mediaUrl: event.mediaUrl,
      externalMessageId: event.externalMessageId,
      providerMessageId: event.providerMessageId,
      status: LEAD_MESSAGE_STATUS.RECEIVED,
      senderName: event.name,
      sentAt: event.occurredAt,
    });

    await createLeadActivity({
      leadId: lead._id,
      activityType: LEAD_ACTIVITY_TYPE.WHATSAPP_IN,
      performedBy: integration.createdBy,
      remark: preview(event.text) || `[${event.messageType}]`,
      metadata: { messageId: message._id.toString() },
    });

    emitLeadMessage(lead, message._id as Types.ObjectId);

    // The creation notice already covers the first message of a brand-new lead.
    if (!resolved.created) {
      await notifyLeadAudience(
        lead,
        NOTIFICATION_TYPES.LEAD_WHATSAPP_RECEIVED,
        `WhatsApp from ${lead.name}`,
        preview(event.text) || `Sent a ${event.messageType}`,
      );
    }

    return {
      outcome: resolved.created ? INTEGRATION_EVENT_OUTCOME.LEAD_CREATED : INTEGRATION_EVENT_OUTCOME.MESSAGE_LOGGED,
      leadId: lead._id,
    };
  }

  if (event.kind === "message_out") {
    // Our own CRM message echoed back by the provider: update it, don't duplicate.
    const own = await findOwnMessage(event);
    if (own) {
      own.providerMessageId ??= event.providerMessageId;
      own.externalMessageId ??= event.externalMessageId;
      if (STATUS_RANK[own.status] < STATUS_RANK.sent) own.status = LEAD_MESSAGE_STATUS.SENT;
      await own.save();
      return { outcome: INTEGRATION_EVENT_OUTCOME.STATUS_UPDATED, leadId: own.lead };
    }

    const resolved = await resolveLeadForContact(integration, event.contactId, { name: null, allowCreate: false });
    if (!resolved) return { outcome: INTEGRATION_EVENT_OUTCOME.IGNORED };
    const { lead } = resolved;

    // A CRM text sent moments ago whose echo carries ids we didn't have yet.
    if (event.text) {
      const recent = await LeadMessage.findOne({
        lead: lead._id,
        direction: LEAD_MESSAGE_DIRECTION.OUT,
        sentFromProvider: false,
        text: event.text,
        externalMessageId: null,
        sentAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
      });
      if (recent) {
        recent.providerMessageId ??= event.providerMessageId;
        recent.externalMessageId = event.externalMessageId;
        await recent.save();
        return { outcome: INTEGRATION_EVENT_OUTCOME.STATUS_UPDATED, leadId: lead._id };
      }
    }

    const message = await LeadMessage.create({
      lead: lead._id,
      integration: integration._id,
      direction: LEAD_MESSAGE_DIRECTION.OUT,
      type: event.messageType,
      text: event.text,
      templateName: event.templateName,
      externalMessageId: event.externalMessageId,
      providerMessageId: event.providerMessageId,
      status: LEAD_MESSAGE_STATUS.SENT,
      sentFromProvider: true,
      senderName: event.operatorName,
      sentAt: event.occurredAt,
    });
    emitLeadMessage(lead, message._id as Types.ObjectId);
    return { outcome: INTEGRATION_EVENT_OUTCOME.MESSAGE_LOGGED, leadId: lead._id };
  }

  // message_status
  const message = await findOwnMessage(event);
  if (!message) return { outcome: INTEGRATION_EVENT_OUTCOME.IGNORED };
  if (event.status === "failed" || STATUS_RANK[event.status] > STATUS_RANK[message.status]) {
    message.status = event.status;
    if (event.error) message.error = event.error;
    message.externalMessageId ??= event.externalMessageId;
    await message.save();
    const lead = await Lead.findById(message.lead).select("_id assignedTo").lean();
    if (lead) emitLeadMessage(lead as ILead, message._id as Types.ObjectId);
  }
  return { outcome: INTEGRATION_EVENT_OUTCOME.STATUS_UPDATED, leadId: message.lead };
};

// =========================================================================
// Webhook intake
// =========================================================================

const recordSuccess = (integrationId: Types.ObjectId) =>
  Integration.updateOne(
    { _id: integrationId },
    {
      $set: { "stats.lastEventAt": new Date(), "stats.consecutiveFailures": 0 },
      $inc: { "stats.eventsReceived": 1 },
    },
  );

const recordFailure = async (integration: IntegrationDoc, error: string) => {
  const updated = await Integration.findByIdAndUpdate(
    integration._id,
    {
      $set: { "stats.lastEventAt": new Date(), "stats.lastErrorAt": new Date(), "stats.lastError": error.slice(0, 500) },
      $inc: { "stats.eventsReceived": 1, "stats.consecutiveFailures": 1 },
    },
    { returnDocument: "after" },
  ).lean();

  if (
    updated &&
    updated.status === INTEGRATION_STATUS.ACTIVE &&
    updated.stats.consecutiveFailures >= INTEGRATION_MAX_CONSECUTIVE_FAILURES
  ) {
    await Integration.updateOne({ _id: integration._id }, { status: INTEGRATION_STATUS.ERROR });
    await notify({
      roles: [ROLES.HEAD],
      type: NOTIFICATION_TYPES.INTEGRATION_ERROR,
      title: `${integration.name} needs attention`,
      message: `${updated.stats.consecutiveFailures} events in a row failed to process. Last error: ${error.slice(0, 160)}`,
      entityId: integration._id,
      entityType: "Integration",
    });
  }
};

/** Runs one logged event through the pipeline and stores the outcome. */
export const runEvent = async (integration: IntegrationDoc, eventLogId: Types.ObjectId, event: NormalizedEvent) => {
  if (event.kind === "ignored") {
    await IntegrationEvent.updateOne({ _id: eventLogId }, { outcome: INTEGRATION_EVENT_OUTCOME.IGNORED });
    await recordSuccess(integration._id);
    return;
  }
  try {
    const result = await processEvent(integration, event);
    await IntegrationEvent.updateOne(
      { _id: eventLogId },
      { outcome: result.outcome, lead: result.leadId ?? null, error: null },
    );
    await recordSuccess(integration._id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[INTEGRATION ${integration._id}] ${event.eventType} failed:`, message);
    await IntegrationEvent.updateOne({ _id: eventLogId }, { outcome: INTEGRATION_EVENT_OUTCOME.FAILED, error: message });
    await recordFailure(integration, message);
  }
};

/**
 * Verifies the webhook URL and queues the events. Returns false for an
 * unknown integration or a wrong secret (the route answers 404). Processing
 * happens after the response, since providers retry anything slower.
 */
export const acceptWebhook = async (
  provider: string,
  integrationId: string,
  secret: string,
  body: unknown,
): Promise<boolean> => {
  if (!Types.ObjectId.isValid(integrationId)) return false;

  if (!isSupportedProvider(provider)) return false;

  const integration = (await Integration.findOne({ _id: integrationId, provider }).select(
    "+webhookSecret",
  )) as IntegrationDoc | null;
  if (!integration || !safeEqual(integration.webhookSecret, secret)) return false;

  // Paused: acknowledge so the provider stops retrying, but do nothing.
  if (integration.status === INTEGRATION_STATUS.PAUSED) return true;

  const events = getAdapter(provider).parseWebhook(body);
  const rawItems = Array.isArray(body) ? body : [body];

  setImmediate(async () => {
    for (const [i, event] of events.entries()) {
      try {
        const log = await IntegrationEvent.create({
          integration: integration._id,
          provider,
          eventType: event.eventType,
          externalEventId: event.externalEventId,
          payload: (rawItems[i] ?? {}) as Record<string, unknown>,
        });
        await runEvent(integration, log._id as Types.ObjectId, event);
      } catch (error) {
        // Duplicate delivery of an event we've already handled.
        if ((error as { code?: number }).code === 11000) continue;
        console.error(`[INTEGRATION ${integrationId}] couldn't log event:`, error);
      }
    }
  });

  return true;
};

// =========================================================================
// One-off import of the provider's existing contacts
// =========================================================================

const MAX_IMPORT_PAGES = 100;

export const importContacts = async (integrationId: string) => {
  const integration = (await Integration.findById(integrationId).select(
    "+credentialsEncrypted",
  )) as IntegrationDoc | null;
  if (!integration) return;

  const creds = loadCredentials(integration);
  const adapter = getAdapter(integration.provider);
  const progress = { status: "running", processed: 0, created: 0, matched: 0, failed: 0, startedAt: new Date(), finishedAt: null as Date | null, error: null as string | null };
  const save = () => Integration.updateOne({ _id: integration._id }, { $set: { "providerConfig.import": progress } });
  await save();

  try {
    for (let page = 1; page <= MAX_IMPORT_PAGES; page++) {
      const { contacts, hasMore } = await adapter.listContacts(creds, integration.providerConfig ?? {}, page);
      for (const contact of contacts) {
        progress.processed++;
        try {
          const resolved = await resolveLeadForContact(integration, contact.contactId, {
            name: contact.name,
            allowCreate: true,
            silent: true,
          });
          if (resolved?.created) progress.created++;
          else if (resolved) progress.matched++;
        } catch {
          progress.failed++;
        }
      }
      await save();
      if (!hasMore) break;
    }
    progress.status = "completed";
  } catch (error) {
    progress.status = "failed";
    progress.error = error instanceof Error ? error.message : String(error);
  }
  progress.finishedAt = new Date();
  await save();

  await notify({
    userIds: [integration.createdBy],
    roles: [ROLES.HEAD],
    type: NOTIFICATION_TYPES.SYSTEM_ALERT,
    title: `${integration.name}: contact import ${progress.status}`,
    message: `${progress.created} new leads, ${progress.matched} already in the CRM${progress.failed ? `, ${progress.failed} couldn't be imported` : ""}.${progress.error ? ` ${progress.error}` : ""}`,
    entityId: integration._id,
    entityType: "Integration",
  });
};
