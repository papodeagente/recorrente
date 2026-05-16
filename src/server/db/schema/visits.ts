import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { scheduledActions } from "./scheduled-actions";
import { serviceCatalog } from "./services";
import { tenants } from "./tenants";

export const visits = pgTable(
  "visits",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    serviceId: text("service_id")
      .notNull()
      .references(() => serviceCatalog.id, { onDelete: "restrict" }),
    visitedAt: timestamp("visited_at", { withTimezone: true }).notNull(),
    revenueCents: bigint("revenue_cents", { mode: "number" }).notNull().default(0),
    recordedVia: text("recorded_via").notNull(),
    recoveredFromTaskId: text("recovered_from_task_id").references(() => scheduledActions.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    recordedViaCheck: check(
      "visits_recorded_via_check",
      sql`${t.recordedVia} IN ('agent_auto','owner_manual','inbox_chat')`,
    ),
    tenantCustomerVisited: index("idx_visits_tenant_customer_visited").on(
      t.tenantId,
      t.customerId,
      t.visitedAt,
    ),
    tenantVisited: index("idx_visits_tenant_visited").on(t.tenantId, t.visitedAt),
  }),
);

export type Visit = typeof visits.$inferSelect;
export type NewVisit = typeof visits.$inferInsert;
