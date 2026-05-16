import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    name: text("name"),
    email: text("email"),
    firstContactAt: timestamp("first_contact_at", { withTimezone: true }),
    lastVisitAt: timestamp("last_visit_at", { withTimezone: true }),
    lgpdConsentAt: timestamp("lgpd_consent_at", { withTimezone: true }),
    lgpdOptedOutAt: timestamp("lgpd_opted_out_at", { withTimezone: true }),
    referralSourceCustomerId: text("referral_source_customer_id").references(
      (): AnyPgColumn => customers.id,
      { onDelete: "set null" },
    ),
    totalVisits: integer("total_visits").notNull().default(0),
    totalRevenueCents: bigint("total_revenue_cents", { mode: "number" }).notNull().default(0),
    notes: text("notes"),
    customAttributes: jsonb("custom_attributes").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneE164: check("customers_phone_e164", sql`${t.phone} ~ '^\\+[1-9]\\d{6,14}$'`),
    tenantPhoneUnique: uniqueIndex("idx_customers_tenant_phone").on(t.tenantId, t.phone),
    tenantLastVisit: index("idx_customers_tenant_last_visit").on(t.tenantId, t.lastVisitAt),
    referralIdx: index("idx_customers_referral_source")
      .on(t.referralSourceCustomerId)
      .where(sql`${t.referralSourceCustomerId} IS NOT NULL`),
  }),
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
