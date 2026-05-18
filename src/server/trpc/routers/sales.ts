import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import {
  auditLogs,
  contacts,
  payments,
  receivables,
  saleItems,
  sales,
} from "@/server/db/schema";
import { tenantDb } from "@/server/lib/tenant-context";
import { router, tenantReadProcedure, tenantWriteProcedure } from "@/server/trpc/init";

const itemInput = z.object({
  productId: z.string().nullable().optional(),
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  unitPriceCents: z.number().int().nonnegative().default(0),
  totalPriceCents: z.number().int().nonnegative().default(0),
});

const createInput = z.object({
  contactId: z.string().nullable().optional(),
  items: z.array(itemInput).min(1),
  discountCents: z.number().int().nonnegative().default(0),
  paidAmountCents: z.number().int().nonnegative().default(0),
  paymentMethod: z.string().nullable().optional(),
  saleDate: z.date().default(() => new Date()),
  dueDate: z.date().nullable().optional(),
  notes: z.string().max(500).optional(),
});

export const salesRouter = router({
  list: tenantReadProcedure
    .input(z.object({ contactId: z.string().optional(), limit: z.number().int().min(1).max(200).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      const t = tenantDb(ctx.tenant.tenantId);
      const where = input?.contactId
        ? and(eq(sales.tenantId, ctx.tenant.tenantId), eq(sales.contactId, input.contactId))
        : eq(sales.tenantId, ctx.tenant.tenantId);
      return t.raw
        .select({
          id: sales.id,
          contactId: sales.contactId,
          contactName: contacts.name,
          totalAmountCents: sales.totalAmountCents,
          paidAmountCents: sales.paidAmountCents,
          pendingAmountCents: sales.pendingAmountCents,
          paymentMethod: sales.paymentMethod,
          paymentStatus: sales.paymentStatus,
          saleStatus: sales.saleStatus,
          source: sales.source,
          saleDate: sales.saleDate,
          notes: sales.notes,
          createdAt: sales.createdAt,
        })
        .from(sales)
        .leftJoin(contacts, eq(contacts.id, sales.contactId))
        .where(where)
        .orderBy(desc(sales.saleDate))
        .limit(input?.limit ?? 100);
    }),

  byId: tenantReadProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const t = tenantDb(ctx.tenant.tenantId);
      const sale = await t.findFirst(sales, eq(sales.id, input.id));
      if (!sale) return null;
      const items = await t.raw
        .select()
        .from(saleItems)
        .where(and(eq(saleItems.tenantId, ctx.tenant.tenantId), eq(saleItems.saleId, input.id)));
      return { sale, items };
    }),

  create: tenantWriteProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const itemsTotal = input.items.reduce(
      (a, i) => a + (i.totalPriceCents || i.unitPriceCents * i.quantity),
      0,
    );
    const total = Math.max(0, itemsTotal - input.discountCents);
    const paid = Math.min(input.paidAmountCents, total);
    const pending = Math.max(0, total - paid);
    const paymentStatus = pending === 0 && total > 0 ? "paid" : paid > 0 ? "partial" : "pending";
    const saleStatus =
      paymentStatus === "paid" ? "paid" : paymentStatus === "partial" ? "partially_paid" : "awaiting_payment";

    return db.transaction(async (tx) => {
      const [s] = await tx
        .insert(sales)
        .values({
          tenantId: ctx.tenant.tenantId,
          contactId: input.contactId ?? null,
          totalAmountCents: total,
          discountCents: input.discountCents,
          paidAmountCents: paid,
          pendingAmountCents: pending,
          paymentMethod: input.paymentMethod ?? null,
          paymentStatus,
          saleStatus,
          source: "manual",
          saleDate: input.saleDate,
          dueDate: input.dueDate ?? null,
          notes: input.notes ?? null,
        })
        .returning();

      for (const it of input.items) {
        await tx.insert(saleItems).values({
          tenantId: ctx.tenant.tenantId,
          saleId: s.id,
          productId: it.productId ?? null,
          description: it.description,
          quantity: String(it.quantity),
          unitPriceCents: it.unitPriceCents,
          totalPriceCents: it.totalPriceCents || it.unitPriceCents * it.quantity,
        });
      }

      if (paid > 0) {
        await tx.insert(payments).values({
          tenantId: ctx.tenant.tenantId,
          direction: "in",
          amountCents: paid,
          paymentMethod: input.paymentMethod ?? null,
          paidAt: input.saleDate,
          saleId: s.id,
          source: "manual",
        });
      }
      if (pending > 0) {
        await tx.insert(receivables).values({
          tenantId: ctx.tenant.tenantId,
          contactId: input.contactId ?? null,
          saleId: s.id,
          description: input.notes ?? "Saldo de venda",
          amountCents: pending,
          amountReceivedCents: 0,
          amountPendingCents: pending,
          dueDate: input.dueDate ?? null,
          status: "open",
          source: "manual",
        });
      }

      if (input.contactId) {
        await tx
          .update(contacts)
          .set({
            totalSpentCents: sql`${contacts.totalSpentCents} + ${total}`,
            totalDueCents: sql`${contacts.totalDueCents} + ${pending}`,
            lastPurchaseAt: input.saleDate,
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, input.contactId));
      }
      await tx.insert(auditLogs).values({
        tenantId: ctx.tenant.tenantId,
        userId: ctx.session.userId,
        actorType: "user",
        action: "create",
        entityType: "sale",
        entityId: s.id,
        newValue: { total, paid, pending } as never,
      });
      return s;
    });
  }),

  cancel: tenantWriteProcedure
    .input(z.object({ id: z.string(), reason: z.string().max(200).optional() }))
    .mutation(async ({ ctx, input }) => {
      const t = tenantDb(ctx.tenant.tenantId);
      const sale = await t.findFirst(sales, eq(sales.id, input.id));
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      if (sale.saleStatus === "cancelled") return sale;
      await db.transaction(async (tx) => {
        await tx
          .update(sales)
          .set({
            saleStatus: "cancelled",
            paymentStatus: "cancelled",
            cancelledAt: new Date(),
            cancelledReason: input.reason ?? null,
            updatedAt: new Date(),
          })
          .where(eq(sales.id, sale.id));
        await tx
          .update(receivables)
          .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(receivables.tenantId, ctx.tenant.tenantId),
              eq(receivables.saleId, sale.id),
              sql`${receivables.status} <> 'received'`,
            ),
          );
        await tx.insert(auditLogs).values({
          tenantId: ctx.tenant.tenantId,
          userId: ctx.session.userId,
          actorType: "user",
          action: "cancel",
          entityType: "sale",
          entityId: sale.id,
          reason: input.reason ?? null,
        });
      });
      return { ok: true };
    }),
});
