import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { contacts } from "./crm";
import { tenants } from "./tenants";
import { users } from "./users";

export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    direction: text("direction").notNull(),
    fromNumber: text("from_number").notNull(),
    toNumber: text("to_number"),
    messageType: text("message_type").notNull(),
    rawContent: text("raw_content"),
    transcription: text("transcription"),
    mediaUrl: text("media_url"),
    zapiMessageId: text("zapi_message_id"),
    whatsappStatus: text("whatsapp_status"),
    processingStatus: text("processing_status").notNull().default("received"),
    aiResponse: text("ai_response"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    directionCheck: check(
      "wmsg_direction_check",
      sql`${t.direction} IN ('inbound','outbound')`,
    ),
    typeCheck: check(
      "wmsg_message_type_check",
      sql`${t.messageType} IN ('text','audio','image','document','video','sticker','unknown')`,
    ),
    waStatusCheck: check(
      "wmsg_whatsapp_status_check",
      sql`${t.whatsappStatus} IS NULL OR ${t.whatsappStatus} IN ('queued','sent','delivered','read','failed','received')`,
    ),
    procStatusCheck: check(
      "wmsg_processing_status_check",
      sql`${t.processingStatus} IN ('received','processing','interpreted','launched','pending_confirmation','error','ignored','responded')`,
    ),
    zapiIdUnique: uniqueIndex("idx_whatsapp_messages_zapi_id")
      .on(t.zapiMessageId)
      .where(sql`${t.zapiMessageId} IS NOT NULL`),
    tenantReceived: index("idx_whatsapp_messages_tenant_received").on(t.tenantId, t.receivedAt),
    tenantStatus: index("idx_whatsapp_messages_tenant_status").on(t.tenantId, t.processingStatus),
    tenantContact: index("idx_whatsapp_messages_tenant_contact").on(
      t.tenantId,
      t.contactId,
      t.receivedAt,
    ),
  }),
);

export const mediaAttachments = pgTable(
  "media_attachments",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceMessageId: text("source_message_id").references(() => whatsappMessages.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    storageUrl: text("storage_url").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindCheck: check(
      "media_attachments_kind_check",
      sql`${t.kind} IN ('audio','image','document','receipt','other')`,
    ),
    tenantIdx: index("idx_media_attachments_tenant").on(t.tenantId),
  }),
);

export type WhatsAppMessage = typeof whatsappMessages.$inferSelect;
export type NewWhatsAppMessage = typeof whatsappMessages.$inferInsert;
export type MediaAttachment = typeof mediaAttachments.$inferSelect;
export type NewMediaAttachment = typeof mediaAttachments.$inferInsert;
