import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { categories } from "./settings";
import { tenants } from "./tenants";

export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    name: text("name"),
    email: text("email"),
    address: text("address"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    origin: text("origin"),
    notes: text("notes"),
    totalSpentCents: bigint("total_spent_cents", { mode: "number" }).notNull().default(0),
    totalDueCents: bigint("total_due_cents", { mode: "number" }).notNull().default(0),
    lastPurchaseAt: timestamp("last_purchase_at", { withTimezone: true }),
    firstContactAt: timestamp("first_contact_at", { withTimezone: true }),
    lgpdConsentAt: timestamp("lgpd_consent_at", { withTimezone: true }),
    lgpdOptedOutAt: timestamp("lgpd_opted_out_at", { withTimezone: true }),
    customAttributes: jsonb("custom_attributes").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneE164: check("contacts_phone_e164", sql`${t.phone} ~ '^\\+[1-9]\\d{6,14}$'`),
    tenantPhoneUnique: uniqueIndex("idx_contacts_tenant_phone").on(t.tenantId, t.phone),
    tenantLastPurchase: index("idx_contacts_tenant_last_purchase").on(
      t.tenantId,
      t.lastPurchaseAt,
    ),
  }),
);

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull().default("product"),
    defaultPriceCents: bigint("default_price_cents", { mode: "number" }).notNull().default(0),
    costPriceCents: bigint("cost_price_cents", { mode: "number" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    typeCheck: check("products_type_check", sql`${t.type} IN ('product','service')`),
    tenantActive: index("idx_products_tenant_active").on(t.tenantId, t.isActive, t.sortOrder),
  }),
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
