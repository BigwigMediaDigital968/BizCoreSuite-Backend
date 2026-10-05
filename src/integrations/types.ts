/**
 * Every lead-source provider (WATI today; Meta, IndiaMART… later) implements
 * this interface. The lead pipeline only ever sees NormalizedEvents, so a new
 * provider doesn't touch lead creation, matching, assignment or messaging.
 */

export interface ProviderCredentials {
  apiEndpoint: string;
  token: string;
}

export type NormalizedEvent =
  | {
      kind: "contact";
      externalEventId: string;
      eventType: string;
      contactId: string;
      name: string | null;
      occurredAt: Date;
    }
  | {
      kind: "message_in";
      externalEventId: string;
      eventType: string;
      contactId: string;
      name: string | null;
      text: string | null;
      messageType: string;
      mediaUrl: string | null;
      externalMessageId: string | null;
      providerMessageId: string | null;
      occurredAt: Date;
    }
  | {
      /** Sent by the business from the provider's own app (not the CRM). */
      kind: "message_out";
      externalEventId: string;
      eventType: string;
      contactId: string;
      text: string | null;
      templateName: string | null;
      messageType: string;
      externalMessageId: string | null;
      providerMessageId: string | null;
      localMessageId: string | null;
      operatorName: string | null;
      occurredAt: Date;
    }
  | {
      kind: "message_status";
      externalEventId: string;
      eventType: string;
      status: "sent" | "delivered" | "read" | "failed";
      externalMessageId: string | null;
      providerMessageId: string | null;
      localMessageId: string | null;
      error: string | null;
    }
  | { kind: "ignored"; externalEventId: string; eventType: string };

export interface NormalizedContact {
  contactId: string;
  name: string | null;
  createdAt: Date | null;
}

export interface ProviderTemplate {
  name: string;
  category: string | null;
  language: string | null;
  body: string | null;
  /** Placeholder names the template expects, e.g. ["name", "1"]. */
  params: string[];
}

export interface TestResult {
  ok: boolean;
  account?: string;
  error?: string;
  /** Non-secret settings to remember (e.g. the API base that worked). */
  providerConfig?: Record<string, unknown>;
}

export interface SendResult {
  providerMessageId: string | null;
  externalMessageId: string | null;
}

export interface ProviderAdapter {
  testConnection(creds: ProviderCredentials): Promise<TestResult>;
  parseWebhook(body: unknown): NormalizedEvent[];
  listContacts(
    creds: ProviderCredentials,
    config: Record<string, unknown>,
    page: number,
  ): Promise<{ contacts: NormalizedContact[]; hasMore: boolean }>;
  listTemplates(
    creds: ProviderCredentials,
    config: Record<string, unknown>,
  ): Promise<ProviderTemplate[]>;
  sendText(
    creds: ProviderCredentials,
    config: Record<string, unknown>,
    to: string,
    text: string,
  ): Promise<SendResult>;
  sendTemplate(
    creds: ProviderCredentials,
    config: Record<string, unknown>,
    to: string,
    templateName: string,
    params: { name: string; value: string }[],
    localMessageId: string,
  ): Promise<SendResult>;
}
