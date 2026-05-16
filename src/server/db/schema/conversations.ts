import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { scheduledActions } from "./scheduled-actions";
import { tenants } from "./tenants";

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("open"),
    agentPausedUntil: timestamp("agent_paused_until", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastHumanMessageAt: timestamp("last_human_message_at", { withTimezone: true }),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusCheck: check("conversations_status_check", sql`${t.status} IN ('open','closed')`),
    tenantCustomerUnique: uniqueIndex("idx_conversations_tenant_customer").on(t.tenantId, t.customerId),
    tenantOpenLastMsg: index("idx_conversations_tenant_open_lastmsg").on(
      t.tenantId,
      t.status,
      t.lastMessageAt,
    ),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(),
    sender: text("sender").notNull(),
    content: text("content").notNull(),
    mediaUrl: text("media_url"),
    zapiMessageId: text("zapi_message_id"),
    whatsappStatus: text("whatsapp_status"),
    relatedActionId: text("related_action_id").references(() => scheduledActions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    directionCheck: check(
      "messages_direction_check",
      sql`${t.direction} IN ('inbound','outbound')`,
    ),
    senderCheck: check(
      "messages_sender_check",
      sql`${t.sender} IN ('customer','agent','owner','system')`,
    ),
    statusCheck: check(
      "messages_whatsapp_status_check",
      sql`${t.whatsappStatus} IS NULL OR ${t.whatsappStatus} IN ('queued','sent','delivered','read','failed')`,
    ),
    tenantConvCreated: index("idx_messages_tenant_conv_created").on(
      t.tenantId,
      t.conversationId,
      t.createdAt,
    ),
    zapiMessageUnique: uniqueIndex("idx_messages_zapi_message_id")
      .on(t.zapiMessageId)
      .where(sql`${t.zapiMessageId} IS NOT NULL`),
  }),
);

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
