import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const businessSettings = pgTable(
  "business_settings",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: "cascade" }),
    aiPersonaName: text("ai_persona_name").notNull().default("Assistente"),
    aiTone: text("ai_tone").notNull().default("amigavel"),
    aiAutoConfirmBelowCents: bigint("ai_auto_confirm_below_cents", { mode: "number" })
      .notNull()
      .default(5000),
    aiAlwaysConfirmAboveCents: bigint("ai_always_confirm_above_cents", { mode: "number" })
      .notNull()
      .default(50000),
    aiAlwaysConfirmNewCustomer: boolean("ai_always_confirm_new_customer").notNull().default(true),
    aiAlwaysConfirmReceiptImage: boolean("ai_always_confirm_receipt_image")
      .notNull()
      .default(true),
    aiAllowAudioAutoCreate: boolean("ai_allow_audio_auto_create").notNull().default(false),
    aiCustomVocabulary: jsonb("ai_custom_vocabulary").notNull().default(sql`'{}'::jsonb`),
    businessHours: jsonb("business_hours").notNull().default(sql`'{}'::jsonb`),
    dailySummaryEnabled: boolean("daily_summary_enabled").notNull().default(true),
    dailySummaryAtHour: integer("daily_summary_at_hour").notNull().default(20),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    toneCheck: check(
      "business_settings_tone_check",
      sql`${t.aiTone} IN ('amigavel','profissional','descolado')`,
    ),
    hourCheck: check(
      "business_settings_hour_check",
      sql`${t.dailySummaryAtHour} BETWEEN 0 AND 23`,
    ),
  }),
);

export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindCheck: check("categories_kind_check", sql`${t.kind} IN ('income','expense')`),
    uniqueNameByKind: uniqueIndex("idx_categories_tenant_kind_name").on(t.tenantId, t.kind, t.name),
  }),
);

export type BusinessSettings = typeof businessSettings.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
