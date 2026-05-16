import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { customers } from "./customers";
import { scheduledActions } from "./scheduled-actions";
import { tenants } from "./tenants";

export const agentDecisions = pgTable(
  "agent_decisions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    relatedActionId: text("related_action_id").references(() => scheduledActions.id, {
      onDelete: "set null",
    }),
    decision: text("decision").notNull(),
    reason: text("reason").notNull(),
    llmModel: text("llm_model"),
    promptInput: jsonb("prompt_input").notNull().default(sql`'{}'::jsonb`),
    llmResponse: jsonb("llm_response"),
    context: jsonb("context").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    decisionCheck: check(
      "agent_decisions_decision_check",
      sql`${t.decision} IN ('sent','not_sent','paused','escalated')`,
    ),
    tenantCreated: index("idx_agent_decisions_tenant_created").on(t.tenantId, t.createdAt),
    tenantCustomerCreated: index("idx_agent_decisions_tenant_customer").on(
      t.tenantId,
      t.customerId,
      t.createdAt,
    ),
  }),
);

export type AgentDecision = typeof agentDecisions.$inferSelect;
export type NewAgentDecision = typeof agentDecisions.$inferInsert;
