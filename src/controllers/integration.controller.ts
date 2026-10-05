import type { Request, Response } from "express";

import {
  createIntegration,
  deleteIntegration,
  getIntegration,
  listEvents,
  listIntegrations,
  listProviders,
  retryEvent,
  rotateWebhook,
  setIntegrationStatus,
  startContactImport,
  testCredentials,
  updateIntegration,
} from "../services/integration.service.js";
import { acceptWebhook } from "../services/integrationLead.service.js";
import { listLeadMessages, listLeadTemplates, sendLeadMessage } from "../services/leadMessage.service.js";
import {
  createIntegrationSchema,
  eventListQuerySchema,
  leadMessageListQuerySchema,
  sendLeadMessageSchema,
  testCredentialsSchema,
  updateIntegrationSchema,
} from "../validators/integration.validator.js";
import { AppError } from "../utils/AppError.js";

// Validation failures throw ZodError, which errorHandler turns into a 400.

const requireUser = (req: Request) => {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }
  return req.user;
};

const param = (req: Request, name: string) => {
  const value = req.params[name];
  if (!value || Array.isArray(value)) throw new AppError(`Invalid ${name}`, 400, "INVALID_PARAM");
  return value;
};

// ---------- Settings → Integrations (Head) ----------

export const getProviders = async (_req: Request, res: Response) =>
  res.status(200).json({ success: true, data: listProviders() });

export const testIntegrationCredentials = async (req: Request, res: Response) => {
  const input = testCredentialsSchema.parse(req.body ?? {});
  const data = await testCredentials(input);
  return res.status(200).json({ success: true, data });
};

export const getIntegrations = async (_req: Request, res: Response) =>
  res.status(200).json({ success: true, data: await listIntegrations() });

export const getIntegrationById = async (req: Request, res: Response) =>
  res.status(200).json({ success: true, data: await getIntegration(param(req, "id")) });

export const postIntegration = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = createIntegrationSchema.parse(req.body ?? {});
  const data = await createIntegration(user, input);
  return res.status(201).json({ success: true, message: "Integration connected", data });
};

export const patchIntegration = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = updateIntegrationSchema.parse(req.body ?? {});
  const data = await updateIntegration(user, param(req, "id"), input);
  return res.status(200).json({ success: true, message: "Integration updated", data });
};

export const pauseIntegration = async (req: Request, res: Response) => {
  const data = await setIntegrationStatus(param(req, "id"), "paused");
  return res.status(200).json({ success: true, message: "Integration paused", data });
};

export const resumeIntegration = async (req: Request, res: Response) => {
  const data = await setIntegrationStatus(param(req, "id"), "active");
  return res.status(200).json({ success: true, message: "Integration resumed", data });
};

export const rotateIntegrationWebhook = async (req: Request, res: Response) => {
  const data = await rotateWebhook(param(req, "id"));
  return res.status(200).json({
    success: true,
    message: "New webhook URL generated. Update it in WATI; the old URL no longer works.",
    data,
  });
};

export const removeIntegration = async (req: Request, res: Response) => {
  await deleteIntegration(param(req, "id"));
  return res.status(200).json({ success: true, message: "Integration deleted" });
};

export const importIntegrationContacts = async (req: Request, res: Response) => {
  const data = await startContactImport(param(req, "id"));
  return res.status(202).json({ success: true, message: "Import started", data });
};

export const getIntegrationEvents = async (req: Request, res: Response) => {
  const query = eventListQuerySchema.parse(req.query);
  const result = await listEvents(param(req, "id"), query);
  return res.status(200).json({ success: true, data: result.items, pagination: result.pagination });
};

export const retryIntegrationEvent = async (req: Request, res: Response) => {
  const data = await retryEvent(param(req, "id"), param(req, "eventId"));
  return res.status(200).json({ success: true, message: "Event retried", data });
};

// ---------- Public webhook ----------

export const receiveWebhook = async (req: Request, res: Response) => {
  const accepted = await acceptWebhook(
    param(req, "provider"),
    param(req, "integrationId"),
    param(req, "secret"),
    req.body,
  );
  // Unknown integration or wrong secret: look like a missing route.
  if (!accepted) return res.status(404).json({ success: false });
  return res.status(200).json({ success: true });
};

// ---------- WhatsApp on a lead ----------

export const getLeadMessages = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = leadMessageListQuerySchema.parse(req.query);
  const data = await listLeadMessages(user, param(req, "id"), query);
  return res.status(200).json({ success: true, data });
};

export const postLeadMessage = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = sendLeadMessageSchema.parse(req.body ?? {});
  const data = await sendLeadMessage(user, param(req, "id"), input);
  return res.status(201).json({ success: true, message: "Message sent", data });
};

export const getLeadTemplates = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const data = await listLeadTemplates(user, param(req, "id"));
  return res.status(200).json({ success: true, data });
};
