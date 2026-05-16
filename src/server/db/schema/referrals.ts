import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { tenants } from "./tenants";

export const referrals = pgTable(
  "referrals",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    referrerCustomerId: text("referrer_customer_id")
      .notNull()
      .references((): AnyPgColumn => customers.id, { onDelete: "cascade" }),
    referredCustomerId: text("referred_customer_id").references(
      (): AnyPgColumn => customers.id,
      { onDelete: "set null" },
    ),
    referredPhone: text("referred_phone").notNull(),
    referredName: text("referred_name"),
    status: text("status").notNull().default("pending"),
    rewardConfigSnapshot: jsonb("reward_config_snapshot").notNull().default(sql`'{}'::jsonb`),
    rewardGrantedAt: timestamp("reward_granted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusCheck: check(
      "referrals_status_check",
      sql`${t.status} IN ('pending','contacted','visited','rewarded','lost')`,
    ),
    phoneE164: check("referrals_phone_e164", sql`${t.referredPhone} ~ '^\\+[1-9]\\d{6,14}$'`),
    tenantStatus: index("idx_referrals_tenant_status").on(t.tenantId, t.status),
    tenantReferrer: index("idx_referrals_tenant_referrer").on(t.tenantId, t.referrerCustomerId),
    tenantPendingPhone: uniqueIndex("idx_referrals_tenant_pending_phone")
      .on(t.tenantId, t.referredPhone)
      .where(sql`${t.status} IN ('pending','contacted')`),
  }),
);

export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;
