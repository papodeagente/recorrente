import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { contacts, products } from "./crm";
import { tenants } from "./tenants";

export const sales = pgTable(
  "sales",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    totalAmountCents: bigint("total_amount_cents", { mode: "number" }).notNull().default(0),
    discountCents: bigint("discount_cents", { mode: "number" }).notNull().default(0),
    paidAmountCents: bigint("paid_amount_cents", { mode: "number" }).notNull().default(0),
    pendingAmountCents: bigint("pending_amount_cents", { mode: "number" }).notNull().default(0),
    paymentMethod: text("payment_method"),
    paymentStatus: text("payment_status").notNull().default("pending"),
    saleStatus: text("sale_status").notNull().default("registered"),
    source: text("source").notNull().default("manual"),
    saleDate: timestamp("sale_date", { withTimezone: true }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    notes: text("notes"),
    sourceMessageId: text("source_message_id"),
    attachmentId: text("attachment_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledReason: text("cancelled_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    paymentStatusCheck: check(
      "sales_payment_status_check",
      sql`${t.paymentStatus} IN ('pending','partial','paid','cancelled')`,
    ),
    saleStatusCheck: check(
      "sales_sale_status_check",
      sql`${t.saleStatus} IN ('registered','awaiting_payment','partially_paid','paid','cancelled')`,
    ),
    sourceCheck: check(
      "sales_source_check",
      sql`${t.source} IN ('whatsapp','manual','import','system')`,
    ),
    tenantDate: index("idx_sales_tenant_date").on(t.tenantId, t.saleDate),
    tenantContact: index("idx_sales_tenant_contact").on(t.tenantId, t.contactId),
    tenantPaymentStatus: index("idx_sales_tenant_payment_status").on(t.tenantId, t.paymentStatus),
    tenantSource: index("idx_sales_tenant_source").on(t.tenantId, t.source),
  }),
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    saleId: text("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull().default(0),
    totalPriceCents: bigint("total_price_cents", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantSale: index("idx_sale_items_tenant_sale").on(t.tenantId, t.saleId),
  }),
);

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
export type SaleItem = typeof saleItems.$inferSelect;
export type NewSaleItem = typeof saleItems.$inferInsert;
