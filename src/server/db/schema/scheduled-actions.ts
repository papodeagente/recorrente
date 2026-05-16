import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { tenants } from "./tenants";

export const scheduledActions = pgTable(
  "scheduled_actions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    attemptNumber: integer("attempt_number").notNull().default(1),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    generatedMessage: text("generated_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    bullJobId: text("bull_job_id"),
    context: jsonb("context").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actionTypeCheck: check(
      "actions_action_type_check",
      sql`${t.actionType} IN ('recurrence_nudge','recovery_attempt','referral_ask','birthday','custom')`,
    ),
    statusCheck: check(
      "actions_status_check",
      sql`${t.status} IN ('pending','sent','replied','converted','failed','cancelled')`,
    ),
    tenantStatusScheduledIdx: index("idx_actions_tenant_status_scheduled").on(
      t.tenantId,
      t.status,
      t.scheduledFor,
    ),
    tenantCustomerTypeIdx: index("idx_actions_tenant_customer_type").on(
      t.tenantId,
      t.customerId,
      t.actionType,
    ),
  }),
);

export type ScheduledAction = typeof scheduledActions.$inferSelect;
export type NewScheduledAction = typeof scheduledActions.$inferInsert;
