import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const tenants = pgTable(
  "tenants",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    businessType: text("business_type").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    zapiInstanceId: text("zapi_instance_id"),
    zapiInstanceToken: text("zapi_instance_token"),
    zapiClientToken: text("zapi_client_token"),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    status: text("status").notNull().default("setup"),
    lgpdDataControllerEmail: text("lgpd_data_controller_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusCheck: check(
      "tenants_status_check",
      sql`${t.status} IN ('active','paused','cancelled','setup')`,
    ),
    zapiInstanceUnique: uniqueIndex("idx_tenants_zapi_instance_id")
      .on(t.zapiInstanceId)
      .where(sql`${t.zapiInstanceId} IS NOT NULL`),
  }),
);

export const userTenants = pgTable(
  "user_tenants",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("owner"),
    permissions: jsonb("permissions").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.tenantId] }),
    roleCheck: check("user_tenants_role_check", sql`${t.role} IN ('owner','manager','operator')`),
    tenantIdx: index("idx_user_tenants_tenant_id").on(t.tenantId),
  }),
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type UserTenant = typeof userTenants.$inferSelect;
