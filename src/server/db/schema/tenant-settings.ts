import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const tenantSettings = pgTable(
  "tenant_settings",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agentPersonaName: text("agent_persona_name").notNull().default("Assistente"),
    agentTone: text("agent_tone").notNull().default("amigavel"),
    businessHours: jsonb("business_hours").notNull().default(sql`'{}'::jsonb`),
    recoveryMessageTemplate: text("recovery_message_template"),
    referralRewardText: text("referral_reward_text"),
    referralEnabled: boolean("referral_enabled").notNull().default(true),
    autoPauseOnHumanReplyHours: integer("auto_pause_on_human_reply_hours").notNull().default(6),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    toneCheck: check(
      "tenant_settings_tone_check",
      sql`${t.agentTone} IN ('amigavel','profissional','descolado')`,
    ),
  }),
);

export type TenantSettings = typeof tenantSettings.$inferSelect;
export type NewTenantSettings = typeof tenantSettings.$inferInsert;
