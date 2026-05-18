import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { contacts } from "./crm";
import { sales } from "./sales";
import { categories } from "./settings";
import { tenants } from "./tenants";

export const receivables = pgTable(
  "receivables",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    saleId: text("sale_id").references(() => sales.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    amountReceivedCents: bigint("amount_received_cents", { mode: "number" }).notNull().default(0),
    amountPendingCents: bigint("amount_pending_cents", { mode: "number" }).notNull().default(0),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: text("status").notNull().default("open"),
    paymentMethod: text("payment_method"),
    notes: text("notes"),
    source: text("source").notNull().default("manual"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusCheck: check(
      "receivables_status_check",
      sql`${t.status} IN ('open','partial','received','overdue','cancelled')`,
    ),
    tenantStatusDue: index("idx_receivables_tenant_status_due").on(t.tenantId, t.status, t.dueDate),
    tenantContact: index("idx_receivables_tenant_contact").on(t.tenantId, t.contactId),
  }),
);

export const payables = pgTable(
  "payables",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    supplierName: text("supplier_name"),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    amountPaidCents: bigint("amount_paid_cents", { mode: "number" }).notNull().default(0),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: text("status").notNull().default("open"),
    paymentMethod: text("payment_method"),
    notes: text("notes"),
    source: text("source").notNull().default("manual"),
    attachmentId: text("attachment_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusCheck: check(
      "payables_status_check",
      sql`${t.status} IN ('open','partial','paid','overdue','cancelled')`,
    ),
    tenantStatusDue: index("idx_payables_tenant_status_due").on(t.tenantId, t.status, t.dueDate),
  }),
);

export const expenses = pgTable(
  "expenses",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    supplierName: text("supplier_name"),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    expenseDate: timestamp("expense_date", { withTimezone: true }).notNull(),
    paymentMethod: text("payment_method"),
    status: text("status").notNull().default("paid"),
    notes: text("notes"),
    source: text("source").notNull().default("manual"),
    attachmentId: text("attachment_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusCheck: check("expenses_status_check", sql`${t.status} IN ('paid','cancelled')`),
    tenantDate: index("idx_expenses_tenant_date").on(t.tenantId, t.expenseDate),
    tenantCategory: index("idx_expenses_tenant_category").on(t.tenantId, t.categoryId),
  }),
);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    paymentMethod: text("payment_method"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    saleId: text("sale_id").references(() => sales.id, { onDelete: "set null" }),
    receivableId: text("receivable_id").references(() => receivables.id, { onDelete: "set null" }),
    payableId: text("payable_id").references(() => payables.id, { onDelete: "set null" }),
    expenseId: text("expense_id").references(() => expenses.id, { onDelete: "set null" }),
    notes: text("notes"),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    directionCheck: check("payments_direction_check", sql`${t.direction} IN ('in','out')`),
    tenantPaidAt: index("idx_payments_tenant_paid_at").on(t.tenantId, t.paidAt),
  }),
);

export type Receivable = typeof receivables.$inferSelect;
export type NewReceivable = typeof receivables.$inferInsert;
export type Payable = typeof payables.$inferSelect;
export type NewPayable = typeof payables.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
