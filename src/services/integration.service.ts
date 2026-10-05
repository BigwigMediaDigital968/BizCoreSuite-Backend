import { Types } from "mongoose";

import { env } from "../config/env.js";
import { getAdapter, isSupportedProvider } from "../integrations/index.js";
import { Branch } from "../models/Branch.js";
import { Integration, type IIntegration } from "../models/Integration.js";
import { IntegrationEvent } from "../models/IntegrationEvent.js";
import { User } from "../models/User.js";
import {
  INTEGRATION_ASSIGNMENT,
  INTEGRATION_CATALOGUE,
  INTEGRATION_EVENT_OUTCOME,
  INTEGRATION_STATUS,
} from "../constants/integration.js";
import { AppError } from "../utils/AppError.js";
import { encryptSecret, randomToken } from "../utils/crypto.js";
import type { AuthenticatedUser } from "../types/auth.js";
import type {
  CreateIntegrationInput,
  EventListQuery,
  TestCredentialsInput,
  UpdateIntegrationInput,
} from "../validators/integration.validator.js";
import { importContacts, loadCredentials, runEvent } from "./integrationLead.service.js";

type IntegrationDoc = IIntegration & { _id: Types.ObjectId };

const hint = (token: string) => {
  const t = token.replace(/^bearer\s+/i, "").trim();
  return t.length > 4 ? `…${t.slice(-4)}` : "…";
};

export const webhookUrlFor = (integration: { _id: Types.ObjectId; provider: string; webhookSecret: string }) =>
  `${env.backendUrl}/api/v1/integrations/webhooks/${integration.provider}/${integration._id.toString()}/${integration.webhookSecret}`;

const POPULATE = [
  { path: "routing.branch", select: "name code" },
  { path: "routing.fixedUser", select: "name email role" },
  { path: "createdBy", select: "name email" },
];

/** What the client may see. Credentials never leave the server. */
const toPublic = (doc: Record<string, any>, withWebhook = false) => {
  const { credentialsEncrypted: _c, webhookSecret, providerConfig, ...rest } = doc;
  return {
    ...rest,
    import: providerConfig?.import ?? null,
    ...(withWebhook && webhookSecret ? { webhookUrl: webhookUrlFor({ _id: doc._id, provider: doc.provider, webhookSecret }) } : {}),
  };
};

const findIntegration = async (id: string, select = "") => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid integration ID", 400, "INVALID_INTEGRATION_ID");
  }
  const integration = await Integration.findById(id).select(select);
  if (!integration) throw new AppError("Integration not found", 404, "INTEGRATION_NOT_FOUND");
  return integration as unknown as IntegrationDoc;
};

const validateRouting = async (routing: CreateIntegrationInput["routing"]) => {
  if (routing.branch) {
    const branch = await Branch.exists({ _id: routing.branch, isActive: true });
    if (!branch) throw new AppError("Branch not found or inactive", 400, "INVALID_BRANCH");
  }
  if (routing.assignment === INTEGRATION_ASSIGNMENT.FIXED_USER) {
    if (!routing.fixedUser) throw new AppError("Choose who receives the leads", 400, "FIXED_USER_REQUIRED");
    const user = await User.exists({ _id: routing.fixedUser, isActive: true });
    if (!user) throw new AppError("Selected user not found or inactive", 400, "INVALID_FIXED_USER");
  }
  if (routing.assignment === INTEGRATION_ASSIGNMENT.ROUND_ROBIN && !routing.branch) {
    throw new AppError("Round robin needs a branch to rotate within", 400, "BRANCH_REQUIRED");
  }
};

// ---------- Catalogue & credentials ----------

export const listProviders = () => INTEGRATION_CATALOGUE;

export const testCredentials = async (input: TestCredentialsInput) => {
  if (!isSupportedProvider(input.provider)) {
    throw new AppError("This provider isn't available yet", 400, "UNSUPPORTED_PROVIDER");
  }
  const result = await getAdapter(input.provider).testConnection(input.credentials);
  return { ok: result.ok, account: result.account ?? null, error: result.error ?? null };
};

// ---------- CRUD ----------

export const listIntegrations = async () => {
  const docs = await Integration.find().populate(POPULATE).sort({ createdAt: -1 }).lean();
  return docs.map((d) => toPublic(d));
};

export const getIntegration = async (id: string) => {
  await findIntegration(id);
  const doc = await Integration.findById(id).select("+webhookSecret").populate(POPULATE).lean();
  return toPublic(doc!, true);
};

export const createIntegration = async (user: AuthenticatedUser, input: CreateIntegrationInput) => {
  if (!isSupportedProvider(input.provider)) {
    throw new AppError("This provider isn't available yet", 400, "UNSUPPORTED_PROVIDER");
  }
  await validateRouting(input.routing);

  const test = await getAdapter(input.provider).testConnection(input.credentials);
  if (!test.ok) {
    throw new AppError(test.error ?? "Couldn't connect with these credentials", 400, "INTEGRATION_TEST_FAILED");
  }

  const integration = await Integration.create({
    provider: input.provider,
    name: input.name,
    status: INTEGRATION_STATUS.ACTIVE,
    credentialsEncrypted: encryptSecret(JSON.stringify(input.credentials)),
    credentialsHint: hint(input.credentials.token),
    webhookSecret: randomToken(),
    providerConfig: { ...(test.providerConfig ?? {}), account: test.account ?? null },
    routing: {
      branch: input.routing.branch ?? null,
      assignment: input.routing.assignment,
      fixedUser: input.routing.fixedUser ?? null,
      roundRobinCursor: 0,
    },
    leadDefaults: { sourceLabel: input.sourceLabel },
    createLeadOn: input.createLeadOn,
    createdBy: new Types.ObjectId(user.id),
  });

  return getIntegration(integration._id.toString());
};

export const updateIntegration = async (user: AuthenticatedUser, id: string, input: UpdateIntegrationInput) => {
  const integration = await findIntegration(id, "+credentialsEncrypted");

  if (input.routing) {
    await validateRouting(input.routing);
    integration.routing = {
      branch: input.routing.branch ? new Types.ObjectId(input.routing.branch) : null,
      assignment: input.routing.assignment,
      fixedUser: input.routing.fixedUser ? new Types.ObjectId(input.routing.fixedUser) : null,
      roundRobinCursor: integration.routing?.roundRobinCursor ?? 0,
    };
  }
  if (input.name) integration.name = input.name;
  if (input.sourceLabel) integration.leadDefaults = { sourceLabel: input.sourceLabel };
  if (input.createLeadOn) integration.createLeadOn = input.createLeadOn;

  if (input.credentials) {
    const test = await getAdapter(integration.provider).testConnection(input.credentials);
    if (!test.ok) {
      throw new AppError(test.error ?? "Couldn't connect with these credentials", 400, "INTEGRATION_TEST_FAILED");
    }
    integration.credentialsEncrypted = encryptSecret(JSON.stringify(input.credentials));
    integration.credentialsHint = hint(input.credentials.token);
    integration.providerConfig = {
      ...(integration.providerConfig ?? {}),
      ...(test.providerConfig ?? {}),
      account: test.account ?? null,
    };
    integration.markModified("providerConfig");
    // New credentials are a fresh start.
    if (integration.status === INTEGRATION_STATUS.ERROR) integration.status = INTEGRATION_STATUS.ACTIVE;
    integration.stats.consecutiveFailures = 0;
  }

  integration.updatedBy = new Types.ObjectId(user.id);
  await integration.save();
  return getIntegration(id);
};

export const setIntegrationStatus = async (id: string, status: "active" | "paused") => {
  const integration = await findIntegration(id);
  integration.status = status;
  if (status === INTEGRATION_STATUS.ACTIVE) integration.stats.consecutiveFailures = 0;
  await integration.save();
  return getIntegration(id);
};

export const rotateWebhook = async (id: string) => {
  const integration = await findIntegration(id);
  await Integration.updateOne({ _id: integration._id }, { webhookSecret: randomToken() });
  return getIntegration(id);
};

/** Leads and their message history stay; only the connection is removed. */
export const deleteIntegration = async (id: string) => {
  const integration = await findIntegration(id);
  await IntegrationEvent.deleteMany({ integration: integration._id });
  await integration.deleteOne();
};

// ---------- Event log ----------

export const listEvents = async (id: string, query: EventListQuery) => {
  const integration = await findIntegration(id);
  const filter: Record<string, unknown> = { integration: integration._id };
  if (query.outcome) filter.outcome = query.outcome;

  const [items, total] = await Promise.all([
    IntegrationEvent.find(filter)
      .populate("lead", "name phoneCountryCode phone")
      .sort({ receivedAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    IntegrationEvent.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
};

export const retryEvent = async (id: string, eventId: string) => {
  const integration = await findIntegration(id);
  if (!Types.ObjectId.isValid(eventId)) throw new AppError("Invalid event ID", 400, "INVALID_EVENT_ID");

  const log = await IntegrationEvent.findOne({ _id: eventId, integration: integration._id });
  if (!log) throw new AppError("Event not found", 404, "EVENT_NOT_FOUND");
  if (log.outcome !== INTEGRATION_EVENT_OUTCOME.FAILED) {
    throw new AppError("Only failed events can be retried", 409, "EVENT_NOT_FAILED");
  }

  const [event] = getAdapter(integration.provider).parseWebhook(log.payload);
  if (!event) throw new AppError("This event can't be read any more", 409, "EVENT_UNREADABLE");

  log.attempts += 1;
  await log.save();
  await runEvent(integration, log._id as Types.ObjectId, event);
  return IntegrationEvent.findById(log._id).populate("lead", "name phoneCountryCode phone").lean();
};

// ---------- Import & templates ----------

export const startContactImport = async (id: string) => {
  const integration = await findIntegration(id);
  const current = (integration.providerConfig?.import as { status?: string } | undefined)?.status;
  if (current === "running") {
    throw new AppError("An import is already running", 409, "IMPORT_RUNNING");
  }
  // Runs in the background; progress is saved on the integration.
  setImmediate(() => {
    importContacts(id).catch((error) => console.error(`[INTEGRATION ${id}] import failed:`, error));
  });
  return { started: true };
};

export const listProviderTemplates = async (integration: IntegrationDoc) => {
  const creds = loadCredentials(integration);
  try {
    return await getAdapter(integration.provider).listTemplates(creds, integration.providerConfig ?? {});
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Couldn't load templates", 502, "PROVIDER_ERROR");
  }
};
