export const INTEGRATION_PROVIDER = {
  WATI: "wati",
} as const;

export type IntegrationProvider =
  (typeof INTEGRATION_PROVIDER)[keyof typeof INTEGRATION_PROVIDER];

export const INTEGRATION_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  ERROR: "error",
} as const;

export type IntegrationStatus =
  (typeof INTEGRATION_STATUS)[keyof typeof INTEGRATION_STATUS];

export const INTEGRATION_ASSIGNMENT = {
  UNASSIGNED: "unassigned",
  ROUND_ROBIN: "round_robin",
  FIXED_USER: "fixed_user",
} as const;

export type IntegrationAssignment =
  (typeof INTEGRATION_ASSIGNMENT)[keyof typeof INTEGRATION_ASSIGNMENT];

export const INTEGRATION_EVENT_OUTCOME = {
  LEAD_CREATED: "lead_created",
  LEAD_MATCHED: "lead_matched",
  MESSAGE_LOGGED: "message_logged",
  STATUS_UPDATED: "status_updated",
  IGNORED: "ignored",
  FAILED: "failed",
} as const;

export type IntegrationEventOutcome =
  (typeof INTEGRATION_EVENT_OUTCOME)[keyof typeof INTEGRATION_EVENT_OUTCOME];

export const LEAD_MESSAGE_DIRECTION = {
  IN: "in",
  OUT: "out",
} as const;

export type LeadMessageDirection =
  (typeof LEAD_MESSAGE_DIRECTION)[keyof typeof LEAD_MESSAGE_DIRECTION];

export const LEAD_MESSAGE_STATUS = {
  RECEIVED: "received",
  PENDING: "pending",
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  FAILED: "failed",
} as const;

export type LeadMessageStatus =
  (typeof LEAD_MESSAGE_STATUS)[keyof typeof LEAD_MESSAGE_STATUS];

/** WhatsApp only allows free-text replies this long after the lead's last message. */
export const WHATSAPP_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Consecutive processing failures before an integration is flagged as errored. */
export const INTEGRATION_MAX_CONSECUTIVE_FAILURES = 5;

/** Raw webhook events are kept this long for debugging and retry. */
export const INTEGRATION_EVENT_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Providers shown in Settings → Integrations. Only `available` ones can be connected. */
export const INTEGRATION_CATALOGUE = [
  {
    provider: INTEGRATION_PROVIDER.WATI,
    name: "WATI",
    description:
      "WhatsApp Business API. New WhatsApp contacts become leads, and your team can chat with them from the lead page.",
    category: "WhatsApp",
    available: true,
  },
  {
    provider: "meta_lead_ads",
    name: "Meta Lead Ads",
    description: "Facebook and Instagram lead forms.",
    category: "Ads",
    available: false,
  },
  {
    provider: "indiamart",
    name: "IndiaMART",
    description: "Buyer enquiries from IndiaMART.",
    category: "Marketplace",
    available: false,
  },
  {
    provider: "website_form",
    name: "Website form",
    description: "Enquiry forms on your website.",
    category: "Website",
    available: false,
  },
] as const;
