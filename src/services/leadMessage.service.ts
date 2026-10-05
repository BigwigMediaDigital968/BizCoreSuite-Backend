import { Types } from "mongoose";

import { getAdapter } from "../integrations/index.js";
import { Integration, type IIntegration } from "../models/Integration.js";
import { LEAD_ACTIVITY_TYPE } from "../models/LeadActivity.js";
import { LeadMessage } from "../models/LeadMessage.js";
import {
  INTEGRATION_STATUS,
  LEAD_MESSAGE_DIRECTION,
  LEAD_MESSAGE_STATUS,
  WHATSAPP_SESSION_WINDOW_MS,
} from "../constants/integration.js";
import { AppError } from "../utils/AppError.js";
import { toWhatsAppId } from "../utils/phone.js";
import type { AuthenticatedUser } from "../types/auth.js";
import type { LeadMessageListQuery, SendLeadMessageInput } from "../validators/integration.validator.js";
import { getLeadById, createLeadActivity } from "./lead.service.js";
import { loadCredentials } from "./integrationLead.service.js";
import { listProviderTemplates } from "./integration.service.js";

type IntegrationDoc = IIntegration & { _id: Types.ObjectId };

/**
 * WhatsApp on a lead is reachable only through the lead: every function here
 * starts with getLeadById, which applies the same role/branch/assignee rules
 * as the lead page. A lead the user can't open reads as "not found".
 */

/**
 * The lead's own integration. WhatsApp is only available on leads linked to
 * one (created by WATI, or matched to a WATI contact by phone); other leads
 * get null and the routes answer WHATSAPP_NOT_AVAILABLE.
 */
const resolveIntegration = async (lead: { integration?: unknown }) => {
  if (!lead.integration) return null;
  const own = await Integration.findOne({
    _id: lead.integration,
    status: { $ne: INTEGRATION_STATUS.PAUSED },
  }).select("+credentialsEncrypted");
  return own as unknown as IntegrationDoc | null;
};

const requireIntegration = async (lead: { integration?: unknown }) => {
  const integration = await resolveIntegration(lead);
  if (!integration) {
    throw new AppError(
      lead.integration
        ? "This lead's WhatsApp integration is paused or was removed."
        : "WhatsApp is only available for leads that came from WATI.",
      409,
      "WHATSAPP_NOT_AVAILABLE",
    );
  }
  return integration;
};

/** The id WhatsApp knows this contact by. */
const contactIdFor = (lead: { externalId?: string; integration?: unknown; phoneCountryCode: string; phone: string }, integration: IntegrationDoc) =>
  lead.integration?.toString() === integration._id.toString() && lead.externalId
    ? lead.externalId
    : toWhatsAppId(lead.phoneCountryCode, lead.phone);

const windowInfo = async (leadId: Types.ObjectId) => {
  const lastInbound = await LeadMessage.findOne({ lead: leadId, direction: LEAD_MESSAGE_DIRECTION.IN })
    .sort({ sentAt: -1 })
    .select("sentAt")
    .lean();
  const lastInboundAt = lastInbound?.sentAt ?? null;
  const closesAt = lastInboundAt ? new Date(new Date(lastInboundAt).getTime() + WHATSAPP_SESSION_WINDOW_MS) : null;
  return { lastInboundAt, windowClosesAt: closesAt, windowOpen: Boolean(closesAt && closesAt > new Date()) };
};

export const listLeadMessages = async (user: AuthenticatedUser, leadId: string, query: LeadMessageListQuery) => {
  const lead = await getLeadById(leadId, user);
  const integration = await resolveIntegration(lead);

  const filter: Record<string, unknown> = { lead: lead._id };
  if (query.before) filter.sentAt = { $lt: new Date(query.before) };

  const messages = await LeadMessage.find(filter)
    .populate("sentBy", "name")
    .sort({ sentAt: -1 })
    .limit(query.limit + 1)
    .lean();

  const hasMore = messages.length > query.limit;
  const page = messages.slice(0, query.limit).reverse();

  return {
    integration: integration
      ? { _id: integration._id, name: integration.name, provider: integration.provider, status: integration.status }
      : null,
    contact: integration ? contactIdFor(lead, integration) : toWhatsAppId(lead.phoneCountryCode, lead.phone),
    ...(await windowInfo(lead._id as Types.ObjectId)),
    messages: page,
    hasMore,
  };
};

export const listLeadTemplates = async (user: AuthenticatedUser, leadId: string) => {
  const lead = await getLeadById(leadId, user);
  return listProviderTemplates(await requireIntegration(lead));
};

const renderTemplate = (body: string | null | undefined, params: { name: string; value: string }[]) => {
  if (!body) return null;
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => params.find((p) => p.name === key)?.value ?? match);
};

export const sendLeadMessage = async (user: AuthenticatedUser, leadId: string, input: SendLeadMessageInput) => {
  const lead = await getLeadById(leadId, user);
  const integration = await requireIntegration(lead);

  if (input.type === "text") {
    const { windowOpen } = await windowInfo(lead._id as Types.ObjectId);
    if (!windowOpen) {
      throw new AppError(
        "WhatsApp only allows free-text replies within 24 hours of the lead's last message. Send an approved template instead.",
        409,
        "WHATSAPP_WINDOW_CLOSED",
      );
    }
  }

  const to = contactIdFor(lead, integration);
  const message = await LeadMessage.create({
    lead: lead._id,
    integration: integration._id,
    direction: LEAD_MESSAGE_DIRECTION.OUT,
    type: input.type === "text" ? "text" : "template",
    text: input.type === "text" ? input.text : renderTemplate(input.templateBody, input.params) ?? `Template: ${input.templateName}`,
    templateName: input.type === "template" ? input.templateName : null,
    status: LEAD_MESSAGE_STATUS.PENDING,
    sentBy: new Types.ObjectId(user.id),
    senderName: user.name,
    sentAt: new Date(),
  });

  const adapter = getAdapter(integration.provider);
  const creds = loadCredentials(integration);
  try {
    const result =
      input.type === "text"
        ? await adapter.sendText(creds, integration.providerConfig ?? {}, to, input.text)
        : await adapter.sendTemplate(
            creds,
            integration.providerConfig ?? {},
            to,
            input.templateName,
            input.params,
            message._id.toString(),
          );
    message.status = LEAD_MESSAGE_STATUS.SENT;
    message.providerMessageId = result.providerMessageId;
    message.externalMessageId = result.externalMessageId;
    await message.save();
  } catch (error) {
    message.status = LEAD_MESSAGE_STATUS.FAILED;
    message.error = error instanceof Error ? error.message : String(error);
    await message.save();
    throw new AppError(message.error, 502, "WHATSAPP_SEND_FAILED");
  }

  await createLeadActivity({
    leadId: lead._id as Types.ObjectId,
    activityType: LEAD_ACTIVITY_TYPE.WHATSAPP_OUT,
    performedBy: user.id,
    remark: input.type === "text" ? input.text.slice(0, 200) : `Template: ${input.templateName}`,
    metadata: { messageId: message._id.toString() },
  });

  return LeadMessage.findById(message._id).populate("sentBy", "name").lean();
};
