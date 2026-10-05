import axios, { AxiosError } from "axios";

import type {
  NormalizedEvent,
  ProviderAdapter,
  ProviderCredentials,
  ProviderTemplate,
} from "../types.js";

/**
 * WATI (WhatsApp Business API), V3 endpoints. https://docs.wati.io
 *
 * The dashboard shows an API endpoint like
 * `https://live-mt-server.wati.io/<tenantId>`. The V3 docs say V3 paths don't
 * take the tenant id, while the official Postman collection prefixes V3
 * paths with the full endpoint. testConnection tries both and remembers the
 * one that works as `providerConfig.v3Base`.
 */

const TIMEOUT_MS = 15_000;
const PAGE_SIZE = 100;
const MAX_TEMPLATE_PAGES = 5;

type Json = Record<string, any>;

const authHeader = (token: string) => {
  const t = token.trim();
  return /^bearer\s/i.test(t) ? t : `Bearer ${t}`;
};

const candidateBases = (apiEndpoint: string) => {
  const trimmed = apiEndpoint.trim().replace(/\/+$/, "");
  const bases = [trimmed];
  try {
    const origin = new URL(trimmed).origin;
    if (origin !== trimmed) bases.push(origin);
  } catch {
    // invalid URL; the request will fail with a clear error
  }
  return bases;
};

const v3Base = (creds: ProviderCredentials, config: Record<string, unknown>) =>
  (typeof config.v3Base === "string" && config.v3Base) ||
  candidateBases(creds.apiEndpoint)[0]!;

const describeError = (error: unknown): string => {
  const err = error as AxiosError<Json>;
  if (err?.response) {
    const data = err.response.data;
    const detail =
      (typeof data === "string" && data) ||
      data?.message ||
      data?.error ||
      data?.title ||
      data?.info;
    if (err.response.status === 401 || err.response.status === 403) {
      return "WATI rejected the access token (unauthorised). Check the token and its scopes.";
    }
    return `WATI responded ${err.response.status}${detail ? `: ${String(detail).slice(0, 300)}` : ""}`;
  }
  if (err?.code === "ECONNABORTED") return "WATI didn't respond in time";
  return err?.message || "Couldn't reach WATI";
};

const request = async <T = Json>(
  creds: ProviderCredentials,
  base: string,
  method: "get" | "post",
  path: string,
  options: { params?: Json; data?: Json } = {},
): Promise<T> => {
  const response = await axios.request<T>({
    method,
    url: `${base}/api/ext/v3${path}`,
    params: options.params,
    data: options.data,
    timeout: TIMEOUT_MS,
    headers: {
      Authorization: authHeader(creds.token),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  return response.data;
};

const toDate = (value: unknown): Date => {
  if (typeof value === "string" && value) {
    // WATI sends both ISO strings and unix-seconds strings.
    if (/^\d{9,11}$/.test(value)) return new Date(Number(value) * 1000);
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
};

const str = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

const STATUS_EVENTS: Record<string, "sent" | "delivered" | "read" | "failed"> = {
  sentmessagedelivered: "delivered",
  sentmessageread: "read",
  sentmessagereplied: "read",
  templatemessagefailed: "failed",
  sessionmessagefailed: "failed",
  messagefailed: "failed",
};

/** "sentMessageDELIVERED_v2" → "sentmessagedelivered". */
const baseEventName = (eventType: string) => eventType.replace(/_v\d+$/i, "").toLowerCase();

export const watiAdapter: ProviderAdapter = {
  async testConnection(creds) {
    let lastError = "Couldn't reach WATI";
    for (const base of candidateBases(creds.apiEndpoint)) {
      try {
        const data = await request<Json>(creds, base, "get", "/channels", {
          params: { page_number: 1, page_size: 10 },
        });
        const channels: Json[] = Array.isArray(data?.channels) ? data.channels : [];
        const account =
          channels
            .map((c) => [c.name, c.channel].filter(Boolean).join(" · "))
            .filter(Boolean)
            .join(", ") || "Connected";
        return { ok: true, account, providerConfig: { v3Base: base } };
      } catch (error) {
        lastError = describeError(error);
        const status = (error as AxiosError)?.response?.status;
        // A bad token fails the same way on every base; don't retry.
        if (status === 401 || status === 403) break;
      }
    }
    return { ok: false, error: lastError };
  },

  parseWebhook(body) {
    const items: Json[] = Array.isArray(body) ? body : body && typeof body === "object" ? [body as Json] : [];

    return items.map((p): NormalizedEvent => {
      const eventType = String(p.eventType ?? "unknown");
      const name = baseEventName(eventType);
      const eventKey =
        str(p.id) ?? str(p.whatsappMessageId) ?? str(p.localMessageId) ?? `${p.waId ?? ""}:${p.created ?? p.timestamp ?? ""}`;
      const externalEventId = `${eventType}:${eventKey}`;
      const contactId = str(p.waId) ?? "";

      if (name === "newcontactmessagereceived") {
        if (!contactId) return { kind: "ignored", externalEventId, eventType };
        return {
          kind: "contact",
          externalEventId,
          eventType,
          contactId,
          name: str(p.senderName),
          occurredAt: toDate(p.created),
        };
      }

      if (name === "message") {
        if (!contactId || p.owner === true) return { kind: "ignored", externalEventId, eventType };
        const data = p.data && typeof p.data === "object" ? (p.data as Json) : null;
        return {
          kind: "message_in",
          externalEventId,
          eventType,
          contactId,
          name: str(p.senderName),
          text:
            str(p.text) ??
            str(p.buttonReply?.text) ??
            str(p.interactiveButtonReply?.title) ??
            str(p.listReply?.title),
          messageType: str(p.type) ?? "text",
          mediaUrl: str(data?.url) ?? str(p.sourceUrl),
          externalMessageId: str(p.whatsappMessageId),
          providerMessageId: str(p.id),
          occurredAt: toDate(p.created ?? p.timestamp),
        };
      }

      if (name === "sessionmessagesent" || name === "templatemessagesent") {
        if (!contactId) return { kind: "ignored", externalEventId, eventType };
        return {
          kind: "message_out",
          externalEventId,
          eventType,
          contactId,
          text: str(p.text),
          templateName: str(p.templateName),
          messageType: str(p.type) ?? (name === "templatemessagesent" ? "template" : "text"),
          externalMessageId: str(p.whatsappMessageId),
          providerMessageId: str(p.id),
          localMessageId: str(p.localMessageId),
          operatorName: str(p.operatorName) ?? str(p.operatorEmail),
          occurredAt: toDate(p.created ?? p.timestamp),
        };
      }

      const status = STATUS_EVENTS[name];
      if (status) {
        return {
          kind: "message_status",
          externalEventId,
          eventType,
          status,
          externalMessageId: str(p.whatsappMessageId),
          providerMessageId: str(p.id),
          localMessageId: str(p.localMessageId),
          error: status === "failed" ? [p.failedCode, p.failedDetail].filter(Boolean).join(": ") || "Failed" : null,
        };
      }

      return { kind: "ignored", externalEventId, eventType };
    });
  },

  async listContacts(creds, config, page) {
    const data = await request<Json>(creds, v3Base(creds, config), "get", "/contacts", {
      params: { page_number: page, page_size: PAGE_SIZE },
    }).catch((error) => {
      throw new Error(describeError(error));
    });
    const list: Json[] = Array.isArray(data?.contact_list) ? data.contact_list : [];
    return {
      contacts: list
        .map((c) => ({
          contactId: str(c.wa_id) ?? str(c.phone) ?? "",
          name: str(c.name) ?? str(c.display_name),
          createdAt: c.created ? toDate(c.created) : null,
        }))
        .filter((c) => c.contactId),
      hasMore: list.length === PAGE_SIZE,
    };
  },

  async listTemplates(creds, config) {
    const templates: ProviderTemplate[] = [];
    for (let page = 1; page <= MAX_TEMPLATE_PAGES; page++) {
      const data = await request<Json>(creds, v3Base(creds, config), "get", "/messageTemplates", {
        params: { page_number: page, page_size: PAGE_SIZE },
      }).catch((error) => {
        throw new Error(describeError(error));
      });
      const list: Json[] = Array.isArray(data?.templates) ? data.templates : [];
      for (const t of list) {
        if (String(t.status ?? "").toUpperCase() !== "APPROVED") continue;
        const body = str(t.hsm) ?? str(t.body_original) ?? str(t.body);
        const fromParams: string[] = Array.isArray(t.custom_params)
          ? t.custom_params.map((c: Json) => String(c.name)).filter(Boolean)
          : [];
        const fromBody = body ? [...body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]!) : [];
        templates.push({
          name: String(t.name ?? t.element_name ?? ""),
          category: str(t.category),
          language: str(t.language_option?.value) ?? str(t.language?.value) ?? null,
          body,
          params: [...new Set([...fromParams, ...fromBody])],
        });
      }
      if (list.length < PAGE_SIZE) break;
    }
    return templates.filter((t) => t.name);
  },

  async sendText(creds, config, to, text) {
    try {
      const data = await request<Json>(creds, v3Base(creds, config), "post", "/conversations/messages/text", {
        data: { target: to, text },
      });
      return { providerMessageId: str(data?.message?.id), externalMessageId: null };
    } catch (error) {
      throw new Error(describeError(error));
    }
  },

  async sendTemplate(creds, config, to, templateName, params, localMessageId) {
    let data: Json;
    try {
      data = await request<Json>(creds, v3Base(creds, config), "post", "/messageTemplates/send", {
        data: {
          template_name: templateName,
          broadcast_name: `crm_${templateName}_${new Date().toISOString().slice(0, 10)}`,
          recipients: [{ phone_number: to, local_message_id: localMessageId, custom_params: params }],
        },
      });
    } catch (error) {
      throw new Error(describeError(error));
    }
    const recipientErrors: string[] = data?.recipients?.[0]?.errors ?? [];
    if (data?.success === false || recipientErrors.length) {
      throw new Error(recipientErrors.join("; ") || String(data?.error ?? "WATI didn't accept the template message"));
    }
    return { providerMessageId: null, externalMessageId: null };
  },
};
