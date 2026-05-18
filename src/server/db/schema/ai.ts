import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { whatsappMessages } from "./whatsapp";

export const aiExtractions = pgTable(
  "ai_extractions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => whatsappMessages.id, { onDelete: "set null" }),
    intent: text("intent").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0"),
    extractedJson: jsonb("extracted_json").notNull().default(sql`'{}'::jsonb`),
    needsConfirmation: boolean("needs_confirmation").notNull().default(true),
    status: text("status").notNull().default("pending"),
    sourceType: text("source_type").notNull(),
    llmModel: text("llm_model"),
    llmPrompt: jsonb("llm_prompt"),
    llmRawResponse: jsonb("llm_raw_response"),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusCheck: check(
      "ai_extractions_status_check",
      sql`${t.status} IN ('pending','confirmed','executed','rejected','expired','error')`,
    ),
    sourceCheck: check(
      "ai_extractions_source_check",
      sql`${t.sourceType} IN ('text','audio','image')`,
    ),
    confidenceCheck: check(
      "ai_extractions_confidence_check",
      sql`${t.confidence} >= 0 AND ${t.confidence} <= 1`,
    ),
    tenantStatus: index("idx_ai_extractions_tenant_status").on(t.tenantId, t.status, t.createdAt),
    tenantIntent: index("idx_ai_extractions_tenant_intent").on(t.tenantId, t.intent),
  }),
);

export const aiActions = pgTable(
  "ai_actions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    extractionId: text("extraction_id")
      .notNull()
      .references(() => aiExtractions.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    status: text("status").notNull().default("pending"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    result: jsonb("result"),
    errorMessage: text("error_message"),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusCheck: check(
      "ai_actions_status_check",
      sql`${t.status} IN ('pending','succeeded','failed','rolled_back')`,
    ),
    tenantExtraction: index("idx_ai_actions_tenant_extraction").on(t.tenantId, t.extractionId),
    tenantStatus: index("idx_ai_actions_tenant_status").on(t.tenantId, t.status),
  }),
);

export type AiExtraction = typeof aiExtractions.$inferSelect;
export type NewAiExtraction = typeof aiExtractions.$inferInsert;
export type AiAction = typeof aiActions.$inferSelect;
export type NewAiAction = typeof aiActions.$inferInsert;
