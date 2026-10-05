import { z } from "zod";

import {
  INTEGRATION_ASSIGNMENT,
  INTEGRATION_EVENT_OUTCOME,
} from "../constants/integration.js";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID");

const credentialsSchema = z.object({
  apiEndpoint: z
    .string()
    .trim()
    .url("Enter the full API endpoint, e.g. https://live-mt-server.wati.io/123456")
    .refine((u) => u.startsWith("https://"), "The API endpoint must use https")
    .transform((u) => u.replace(/\/+$/, "")),
  token: z.string().trim().min(20, "That doesn't look like a complete access token").max(4000),
});

const routingSchema = z.object({
  branch: objectIdSchema.nullable().optional(),
  assignment: z.enum([
    INTEGRATION_ASSIGNMENT.UNASSIGNED,
    INTEGRATION_ASSIGNMENT.ROUND_ROBIN,
    INTEGRATION_ASSIGNMENT.FIXED_USER,
  ]),
  fixedUser: objectIdSchema.nullable().optional(),
});

const createLeadOnSchema = z.object({
  newContact: z.boolean(),
  messageFromUnknown: z.boolean(),
});

export const testCredentialsSchema = z.object({
  provider: z.string().trim().min(1),
  credentials: credentialsSchema,
});

export type TestCredentialsInput = z.infer<typeof testCredentialsSchema>;

export const createIntegrationSchema = z.object({
  provider: z.string().trim().min(1),
  name: z.string().trim().min(2, "Give the integration a name").max(100),
  credentials: credentialsSchema,
  routing: routingSchema,
  sourceLabel: z.string().trim().min(1).max(100).default("WATI"),
  createLeadOn: createLeadOnSchema.default({ newContact: true, messageFromUnknown: true }),
});

export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;

export const updateIntegrationSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  credentials: credentialsSchema.optional(),
  routing: routingSchema.optional(),
  sourceLabel: z.string().trim().min(1).max(100).optional(),
  createLeadOn: createLeadOnSchema.optional(),
});

export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>;

export const eventListQuerySchema = z.object({
  outcome: z
    .enum(Object.values(INTEGRATION_EVENT_OUTCOME) as [string, ...string[]])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export const leadMessageListQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type LeadMessageListQuery = z.infer<typeof leadMessageListQuerySchema>;

export const sendLeadMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().trim().min(1, "Type a message").max(4096),
  }),
  z.object({
    type: z.literal("template"),
    templateName: z.string().trim().min(1).max(200),
    /** The template body as shown to the sender, used to store a readable copy. */
    templateBody: z.string().max(4096).nullable().optional(),
    params: z
      .array(z.object({ name: z.string().trim().min(1).max(60), value: z.string().trim().max(1000) }))
      .max(20)
      .default([]),
  }),
]);

export type SendLeadMessageInput = z.infer<typeof sendLeadMessageSchema>;
