/**
 * Executor — recebe uma ExtractionResult e cria os registros no banco.
 *
 * Toda operação é escrita via tenantDb (invariante multi-tenant) + cria
 * audit_log com actor='ai'. Falhas individuais não derrubam o processo:
 * o erro fica em ai_actions.error_message + status='failed'.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  aiActions,
  categories,
  contacts,
  expenses,
  payments,
  receivables,
  saleItems,
  sales,
  tasks,
  auditLogs,
} from "@/server/db/schema";
import { logger } from "@/server/lib/logger";
import type { ExtractionResult } from "./extractor";

export type ExecutionContext = {
  tenantId: string;
  extractionId: string;
  contactIdHint?: string | null; // se webhook já achou o customer pelo phone
};

export type ExecutionOutcome = {
  ok: boolean;
  createdEntityIds: string[];
  message: string;
  errors: string[];
};

async function logAction(input: {
  tenantId: string;
  extractionId: string;
  actionType: string;
  entityType?: string;
  entityId?: string;
  status: "succeeded" | "failed";
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  errorMessage?: string;
}) {
  await db.insert(aiActions).values({
    tenantId: input.tenantId,
    extractionId: input.extractionId,
    actionType: input.actionType,
    entityType: input.entityType,
    entityId: input.entityId,
    status: input.status,
    payload: (input.payload ?? {}) as never,
    result: (input.result ?? {}) as never,
    errorMessage: input.errorMessage,
    executedAt: new Date(),
  });
}

async function audit(input: {
  tenantId: string;
  entityType: string;
  entityId: string;
  newValue: Record<string, unknown>;
  action?: string;
}) {
  await db.insert(auditLogs).values({
    tenantId: input.tenantId,
    actorType: "ai",
    action: input.action ?? "create",
    entityType: input.entityType,
    entityId: input.entityId,
    newValue: input.newValue as never,
  });
}

function normalizePhone(p?: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55")) return `+${digits}`;
  return `+${digits.length <= 11 ? "55" : ""}${digits}`;
}

async function upsertContact(
  tenantId: string,
  input: { name?: string | null; phone?: string | null },
): Promise<string | null> {
  const phone = normalizePhone(input.phone ?? null);
  if (!phone) return null;
  const found = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.phone, phone)))
    .limit(1);
  if (found[0]) {
    if (input.name && !found[0].name) {
      await db
        .update(contacts)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(contacts.id, found[0].id));
    }
    return found[0].id;
  }
  const [created] = await db
    .insert(contacts)
    .values({
      tenantId,
      phone,
      name: input.name ?? null,
      firstContactAt: new Date(),
      origin: "whatsapp",
    })
    .returning();
  await audit({
    tenantId,
    entityType: "contact",
    entityId: created.id,
    newValue: { phone, name: input.name },
  });
  return created.id;
}

async function findCategoryId(
  tenantId: string,
  kind: "income" | "expense",
  name: string | null | undefined,
): Promise<string | null> {
  if (!name) return null;
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.tenantId, tenantId),
        eq(categories.kind, kind),
        sql`LOWER(${categories.name}) = LOWER(${name})`,
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function execute(
  extraction: ExtractionResult,
  ctx: ExecutionContext,
): Promise<ExecutionOutcome> {
  const created: string[] = [];
  const errors: string[] = [];

  try {
    switch (extraction.intent) {
      case "register_sale": {
        const sale = extraction.sale ?? {};
        const contactId =
          ctx.contactIdHint ??
          (await upsertContact(ctx.tenantId, sale.contact ?? {}));
        const total = sale.total_amount_cents ?? sumItems(sale.items);
        const paid = sale.paid_amount_cents ?? 0;
        const pending = sale.pending_amount_cents ?? Math.max(0, total - paid);
        const paymentStatus =
          pending === 0 && total > 0 ? "paid" : paid > 0 ? "partial" : "pending";

        const saleRow = await db.transaction(async (tx) => {
          const [s] = await tx
            .insert(sales)
            .values({
              tenantId: ctx.tenantId,
              contactId: contactId,
              totalAmountCents: total,
              paidAmountCents: paid,
              pendingAmountCents: pending,
              paymentMethod: sale.payment_method ?? null,
              paymentStatus,
              saleStatus: paymentStatus === "paid" ? "paid" : paymentStatus === "partial" ? "partially_paid" : "awaiting_payment",
              source: "whatsapp",
              saleDate: new Date(),
              dueDate: sale.due_date_iso ? new Date(sale.due_date_iso) : null,
              notes: sale.notes ?? null,
            })
            .returning();

          for (const it of sale.items ?? []) {
            await tx.insert(saleItems).values({
              tenantId: ctx.tenantId,
              saleId: s.id,
              description: it.description,
              quantity: String(it.quantity ?? 1),
              unitPriceCents: it.unit_price_cents ?? 0,
              totalPriceCents:
                it.total_cents ?? (it.unit_price_cents ?? 0) * (it.quantity ?? 1),
            });
          }

          if (paid > 0) {
            await tx.insert(payments).values({
              tenantId: ctx.tenantId,
              direction: "in",
              amountCents: paid,
              paymentMethod: sale.payment_method ?? null,
              paidAt: new Date(),
              saleId: s.id,
              source: "whatsapp",
            });
          }

          if (pending > 0) {
            await tx.insert(receivables).values({
              tenantId: ctx.tenantId,
              contactId: contactId,
              saleId: s.id,
              description: sale.notes ?? "Saldo de venda",
              amountCents: pending,
              amountReceivedCents: 0,
              amountPendingCents: pending,
              dueDate: sale.due_date_iso ? new Date(sale.due_date_iso) : null,
              status: "open",
              source: "whatsapp",
            });
          }

          if (contactId) {
            await tx
              .update(contacts)
              .set({
                totalSpentCents: sql`${contacts.totalSpentCents} + ${total}`,
                totalDueCents: sql`${contacts.totalDueCents} + ${pending}`,
                lastPurchaseAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(contacts.id, contactId));
          }
          return s;
        });

        await audit({ tenantId: ctx.tenantId, entityType: "sale", entityId: saleRow.id, newValue: { total, paid, pending } });
        await logAction({
          tenantId: ctx.tenantId,
          extractionId: ctx.extractionId,
          actionType: "create_sale",
          entityType: "sale",
          entityId: saleRow.id,
          status: "succeeded",
          payload: { total, paid, pending },
        });
        created.push(saleRow.id);
        return { ok: true, createdEntityIds: created, message: "venda registrada", errors };
      }

      case "register_expense": {
        const exp = extraction.expense ?? {};
        if (!exp.amount_cents || exp.amount_cents <= 0) {
          errors.push("expense without amount");
          await logAction({ tenantId: ctx.tenantId, extractionId: ctx.extractionId, actionType: "create_expense", status: "failed", errorMessage: "missing amount" });
          return { ok: false, createdEntityIds: [], message: "valor faltando", errors };
        }
        const categoryId = await findCategoryId(ctx.tenantId, "expense", exp.expense_category);
        const [row] = await db
          .insert(expenses)
          .values({
            tenantId: ctx.tenantId,
            supplierName: exp.supplier_name ?? null,
            categoryId,
            description: exp.description ?? exp.supplier_name ?? "Despesa",
            amountCents: exp.amount_cents,
            expenseDate: exp.date_iso ? new Date(exp.date_iso) : new Date(),
            paymentMethod: exp.payment_method ?? null,
            status: "paid",
            source: "whatsapp",
            notes: exp.notes ?? null,
          })
          .returning();
        await db.insert(payments).values({
          tenantId: ctx.tenantId,
          direction: "out",
          amountCents: exp.amount_cents,
          paymentMethod: exp.payment_method ?? null,
          paidAt: row.expenseDate,
          expenseId: row.id,
          source: "whatsapp",
        });
        await audit({ tenantId: ctx.tenantId, entityType: "expense", entityId: row.id, newValue: { amount: exp.amount_cents } });
        await logAction({ tenantId: ctx.tenantId, extractionId: ctx.extractionId, actionType: "create_expense", entityType: "expense", entityId: row.id, status: "succeeded" });
        created.push(row.id);
        return { ok: true, createdEntityIds: created, message: "despesa registrada", errors };
      }

      case "register_payment_received": {
        const pay = extraction.payment ?? {};
        if (!pay.amount_cents || pay.amount_cents <= 0) {
          errors.push("payment without amount");
          await logAction({ tenantId: ctx.tenantId, extractionId: ctx.extractionId, actionType: "record_payment", status: "failed", errorMessage: "missing amount" });
          return { ok: false, createdEntityIds: [], message: "valor faltando", errors };
        }
        const contactId =
          ctx.contactIdHint ?? (await upsertContact(ctx.tenantId, pay.contact ?? {}));
        // Tenta encontrar receivable mais antigo do contato pra abater.
        let receivableId: string | null = null;
        if (contactId) {
          const [r] = await db
            .select()
            .from(receivables)
            .where(
              and(
                eq(receivables.tenantId, ctx.tenantId),
                eq(receivables.contactId, contactId),
                sql`${receivables.status} IN ('open','partial','overdue')`,
              ),
            )
            .orderBy(receivables.dueDate)
            .limit(1);
          if (r) {
            receivableId = r.id;
            const newReceived = r.amountReceivedCents + pay.amount_cents;
            const newPending = Math.max(0, r.amountCents - newReceived);
            await db
              .update(receivables)
              .set({
                amountReceivedCents: newReceived,
                amountPendingCents: newPending,
                status: newPending === 0 ? "received" : "partial",
                updatedAt: new Date(),
              })
              .where(eq(receivables.id, r.id));
          }
        }
        const [p] = await db
          .insert(payments)
          .values({
            tenantId: ctx.tenantId,
            direction: "in",
            amountCents: pay.amount_cents,
            paymentMethod: pay.payment_method ?? null,
            paidAt: pay.date_iso ? new Date(pay.date_iso) : new Date(),
            receivableId,
            source: "whatsapp",
            notes: pay.notes ?? null,
          })
          .returning();
        await audit({ tenantId: ctx.tenantId, entityType: "payment", entityId: p.id, newValue: { amount: pay.amount_cents, contactId } });
        await logAction({ tenantId: ctx.tenantId, extractionId: ctx.extractionId, actionType: "record_payment", entityType: "payment", entityId: p.id, status: "succeeded" });
        created.push(p.id);
        return { ok: true, createdEntityIds: created, message: "pagamento registrado", errors };
      }

      case "create_task": {
        const t = extraction.task ?? {};
        if (!t.title) {
          await logAction({ tenantId: ctx.tenantId, extractionId: ctx.extractionId, actionType: "create_task", status: "failed", errorMessage: "missing title" });
          return { ok: false, createdEntityIds: [], message: "título faltando", errors };
        }
        const contactId =
          t.contact_phone ? await upsertContact(ctx.tenantId, { phone: t.contact_phone }) : null;
        const [row] = await db
          .insert(tasks)
          .values({
            tenantId: ctx.tenantId,
            contactId,
            title: t.title,
            dueAt: t.due_iso ? new Date(t.due_iso) : null,
            source: "whatsapp",
          })
          .returning();
        await audit({ tenantId: ctx.tenantId, entityType: "task", entityId: row.id, newValue: { title: t.title } });
        await logAction({ tenantId: ctx.tenantId, extractionId: ctx.extractionId, actionType: "create_task", entityType: "task", entityId: row.id, status: "succeeded" });
        created.push(row.id);
        return { ok: true, createdEntityIds: created, message: "tarefa criada", errors };
      }

      case "create_contact":
      case "update_contact": {
        const c = extraction.contact ?? {};
        const id = await upsertContact(ctx.tenantId, c);
        if (!id) {
          await logAction({ tenantId: ctx.tenantId, extractionId: ctx.extractionId, actionType: "create_contact", status: "failed", errorMessage: "missing phone" });
          return { ok: false, createdEntityIds: [], message: "telefone faltando", errors };
        }
        if (c.notes) {
          await db
            .update(contacts)
            .set({ notes: c.notes, updatedAt: new Date() })
            .where(eq(contacts.id, id));
        }
        await logAction({ tenantId: ctx.tenantId, extractionId: ctx.extractionId, actionType: "create_contact", entityType: "contact", entityId: id, status: "succeeded" });
        created.push(id);
        return { ok: true, createdEntityIds: created, message: "contato atualizado", errors };
      }

      // Queries: não criam nada — só respondem.
      case "query_revenue_today":
      case "query_overdue":
      case "query_expenses_today":
      case "query_summary":
      case "other":
      case "unknown":
      default: {
        await logAction({ tenantId: ctx.tenantId, extractionId: ctx.extractionId, actionType: "answer_query", status: "succeeded" });
        return { ok: true, createdEntityIds: [], message: "query/answer", errors };
      }
    }
  } catch (err) {
    const msg = (err as Error).message;
    logger.error({ tenantId: ctx.tenantId, intent: extraction.intent, err: msg }, "[executor] failure");
    await logAction({
      tenantId: ctx.tenantId,
      extractionId: ctx.extractionId,
      actionType: extraction.intent,
      status: "failed",
      errorMessage: msg,
    });
    errors.push(msg);
    return { ok: false, createdEntityIds: created, message: "erro de execução", errors };
  }
}

function sumItems(items?: Array<{ total_cents?: number; unit_price_cents?: number; quantity?: number }>): number {
  if (!items?.length) return 0;
  return items.reduce((acc, i) => {
    const t = i.total_cents ?? (i.unit_price_cents ?? 0) * (i.quantity ?? 1);
    return acc + (Number.isFinite(t) ? t : 0);
  }, 0);
}
