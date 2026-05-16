import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const serviceCatalog = pgTable(
  "service_catalog",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: bigint("price_cents", { mode: "number" }).notNull().default(0),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    recurrenceDays: integer("recurrence_days").notNull().default(30),
    recoveryAfterDays: integer("recovery_after_days").notNull().default(45),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    recoveryAfterRecurrence: check(
      "service_recovery_after_recurrence",
      sql`${t.recoveryAfterDays} >= ${t.recurrenceDays}`,
    ),
    tenantActiveIdx: index("idx_service_tenant_active").on(t.tenantId, t.isActive, t.sortOrder),
  }),
);

export type Service = typeof serviceCatalog.$inferSelect;
export type NewService = typeof serviceCatalog.$inferInsert;
