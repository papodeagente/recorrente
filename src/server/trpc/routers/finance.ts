import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import {
  auditLogs,
  contacts,
  expenses,
  payables,
  payments,
  receivables,
} from "@/server/db/schema";
import { tenantDb } from "@/server/lib/tenant-context";
import { router, tenantReadProcedure, tenantWriteProcedure } from "@/server/trpc/init";

// ─────────────────────────────  RECEIVABLES  ─────────────────────────────
export const receivablesRouter = router({
  list: tenantReadProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where = input?.status
        ? and(eq(receivables.tenantId, ctx.tenant.tenantId), eq(receivables.status, input.status))
        : eq(receivables.tenantId, ctx.tenant.tenantId);
      return tenantDb(ctx.tenant.tenantId).raw
        .select({
          id: receivables.id,
          contactId: receivables.contactId,
          contactName: contacts.name,
          description: receivables.description,
          amountCents: receivables.amountCents,
          amountReceivedCents: receivables.amountReceivedCents,
          amountPendingCents: receivables.amountPendingCents,
          dueDate: receivables.dueDate,
          status: receivables.status,
          paymentMethod: receivables.paymentMethod,
          source: receivables.source,
        })
        .from(receivables)
        .leftJoin(contacts, eq(contacts.id, receivables.contactId))
        .where(where)
        .orderBy(receivables.dueDate, desc(receivables.createdAt))
        .limit(200);
    }),

  receivePayment: tenantWriteProcedure
    .input(z.object({ id: z.string(), amountCents: z.number().int().positive(), paymentMethod: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const t = tenantDb(ctx.tenant.tenantId);
      const r = await t.findFirst(receivables, eq(receivables.id, input.id));
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });
      const newReceived = r.amountReceivedCents + input.amountCents;
      const newPending = Math.max(0, r.amountCents - newReceived);
      const status = newPending === 0 ? "received" : "partial";
      await db.transaction(async (tx) => {
        await tx
          .update(receivables)
          .set({
            amountReceivedCents: newReceived,
            amountPendingCents: newPending,
            status,
            paymentMethod: input.paymentMethod ?? r.paymentMethod,
            updatedAt: new Date(),
          })
          .where(eq(receivables.id, r.id));
        await tx.insert(payments).values({
          tenantId: ctx.tenant.tenantId,
          direction: "in",
          amountCents: input.amountCents,
          paymentMethod: input.paymentMethod ?? null,
          paidAt: new Date(),
          receivableId: r.id,
          source: "manual",
        });
        if (r.contactId) {
          await tx
            .update(contacts)
            .set({
              totalDueCents: sql`GREATEST(0, ${contacts.totalDueCents} - ${input.amountCents})`,
              updatedAt: new Date(),
            })
            .where(eq(contacts.id, r.contactId));
        }
        await tx.insert(auditLogs).values({
          tenantId: ctx.tenant.tenantId,
          userId: ctx.session.userId,
          actorType: "user",
          action: "update",
          entityType: "receivable",
          entityId: r.id,
          newValue: { amountReceivedCents: newReceived, status } as never,
        });
      });
      return { ok: true, status };
    }),

  cancel: tenantWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await tenantDb(ctx.tenant.tenantId).update(
        receivables,
        { status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() },
        eq(receivables.id, input.id),
      );
      return row;
    }),
});

// ─────────────────────────────  PAYABLES  ─────────────────────────────
const payableInput = z.object({
  supplierName: z.string().max(120).optional(),
  description: z.string().min(1).max(200),
  amountCents: z.number().int().positive(),
  dueDate: z.date().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  notes: z.string().max(500).optional(),
});

export const payablesRouter = router({
  list: tenantReadProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where = input?.status
        ? and(eq(payables.tenantId, ctx.tenant.tenantId), eq(payables.status, input.status))
        : eq(payables.tenantId, ctx.tenant.tenantId);
      return tenantDb(ctx.tenant.tenantId).raw
        .select()
        .from(payables)
        .where(where)
        .orderBy(payables.dueDate, desc(payables.createdAt))
        .limit(200);
    }),

  create: tenantWriteProcedure.input(payableInput).mutation(async ({ ctx, input }) => {
    const [row] = await tenantDb(ctx.tenant.tenantId).insert(payables, input);
    return row;
  }),

  markPaid: tenantWriteProcedure
    .input(z.object({ id: z.string(), amountCents: z.number().int().positive(), paymentMethod: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const t = tenantDb(ctx.tenant.tenantId);
      const p = await t.findFirst(payables, eq(payables.id, input.id));
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      const newPaid = p.amountPaidCents + input.amountCents;
      const status = newPaid >= p.amountCents ? "paid" : "partial";
      await db.transaction(async (tx) => {
        await tx
          .update(payables)
          .set({
            amountPaidCents: newPaid,
            status,
            paymentMethod: input.paymentMethod ?? p.paymentMethod,
            updatedAt: new Date(),
          })
          .where(eq(payables.id, p.id));
        await tx.insert(payments).values({
          tenantId: ctx.tenant.tenantId,
          direction: "out",
          amountCents: input.amountCents,
          paymentMethod: input.paymentMethod ?? null,
          paidAt: new Date(),
          payableId: p.id,
          source: "manual",
        });
      });
      return { ok: true, status };
    }),

  cancel: tenantWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await tenantDb(ctx.tenant.tenantId).update(
        payables,
        { status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() },
        eq(payables.id, input.id),
      );
      return row;
    }),
});

// ─────────────────────────────  EXPENSES  ─────────────────────────────
const expenseInput = z.object({
  supplierName: z.string().max(120).optional(),
  description: z.string().min(1).max(200),
  amountCents: z.number().int().positive(),
  expenseDate: z.date().default(() => new Date()),
  categoryId: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  notes: z.string().max(500).optional(),
});

export const expensesRouter = router({
  list: tenantReadProcedure.query(async ({ ctx }) => {
    return tenantDb(ctx.tenant.tenantId).raw
      .select()
      .from(expenses)
      .where(eq(expenses.tenantId, ctx.tenant.tenantId))
      .orderBy(desc(expenses.expenseDate))
      .limit(200);
  }),

  create: tenantWriteProcedure.input(expenseInput).mutation(async ({ ctx, input }) => {
    const t = tenantDb(ctx.tenant.tenantId);
    const [row] = await t.insert(expenses, input);
    await db.insert(payments).values({
      tenantId: ctx.tenant.tenantId,
      direction: "out",
      amountCents: input.amountCents,
      paymentMethod: input.paymentMethod ?? null,
      paidAt: input.expenseDate,
      expenseId: row.id,
      source: "manual",
    });
    return row;
  }),

  cancel: tenantWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await tenantDb(ctx.tenant.tenantId).update(
        expenses,
        { status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() },
        eq(expenses.id, input.id),
      );
      return row;
    }),
});
