import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import {
  categories,
  contacts,
  expenses,
  payments,
  saleItems,
  sales,
} from "@/server/db/schema";
import { router, tenantReadProcedure } from "@/server/trpc/init";

type Period = "today" | "week" | "month";

function periodStart(p: Period): Date {
  const d = new Date();
  if (p === "today") {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (p === "week") {
    const day = d.getDay() || 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day + 1);
    return d;
  }
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

const periodSchema = z.object({ period: z.enum(["today", "week", "month"]).default("month") });

export const reportsRouter = router({
  /**
   * Vendas agrupadas por dia. Retorna até `daysBack` dias atrás.
   */
  salesByDay: tenantReadProcedure
    .input(z.object({ daysBack: z.number().int().min(1).max(90).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const start = new Date();
      start.setDate(start.getDate() - (input?.daysBack ?? 30));
      start.setHours(0, 0, 0, 0);
      const rows = await db
        .select({
          day: sql<string>`date_trunc('day', ${sales.saleDate})::date`,
          total: sql<number>`COALESCE(SUM(${sales.totalAmountCents}), 0)`,
          received: sql<number>`COALESCE(SUM(${sales.paidAmountCents}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(sales)
        .where(
          and(
            eq(sales.tenantId, ctx.tenant.tenantId),
            gte(sales.saleDate, start),
            sql`${sales.paymentStatus} <> 'cancelled'`,
          ),
        )
        .groupBy(sql`date_trunc('day', ${sales.saleDate})`)
        .orderBy(sql`date_trunc('day', ${sales.saleDate})`);
      return rows.map((r) => ({
        day: String(r.day),
        totalCents: Number(r.total ?? 0),
        receivedCents: Number(r.received ?? 0),
        count: Number(r.count ?? 0),
      }));
    }),

  topProducts: tenantReadProcedure.input(periodSchema).query(async ({ ctx, input }) => {
    const start = periodStart(input.period);
    const rows = await db
      .select({
        description: saleItems.description,
        qty: sql<number>`SUM(${saleItems.quantity})`,
        total: sql<number>`SUM(${saleItems.totalPriceCents})`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(
        and(
          eq(saleItems.tenantId, ctx.tenant.tenantId),
          gte(sales.saleDate, start),
          sql`${sales.paymentStatus} <> 'cancelled'`,
        ),
      )
      .groupBy(saleItems.description)
      .orderBy(desc(sql`SUM(${saleItems.totalPriceCents})`))
      .limit(10);
    return rows.map((r) => ({
      description: r.description,
      qty: Number(r.qty ?? 0),
      totalCents: Number(r.total ?? 0),
    }));
  }),

  topCustomers: tenantReadProcedure.input(periodSchema).query(async ({ ctx, input }) => {
    const start = periodStart(input.period);
    const rows = await db
      .select({
        contactId: sales.contactId,
        contactName: contacts.name,
        contactPhone: contacts.phone,
        total: sql<number>`SUM(${sales.totalAmountCents})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(sales)
      .leftJoin(contacts, eq(contacts.id, sales.contactId))
      .where(
        and(
          eq(sales.tenantId, ctx.tenant.tenantId),
          gte(sales.saleDate, start),
          sql`${sales.paymentStatus} <> 'cancelled'`,
          sql`${sales.contactId} IS NOT NULL`,
        ),
      )
      .groupBy(sales.contactId, contacts.name, contacts.phone)
      .orderBy(desc(sql`SUM(${sales.totalAmountCents})`))
      .limit(10);
    return rows.map((r) => ({
      contactId: r.contactId,
      name: r.contactName,
      phone: r.contactPhone,
      totalCents: Number(r.total ?? 0),
      count: Number(r.count ?? 0),
    }));
  }),

  expensesByCategory: tenantReadProcedure.input(periodSchema).query(async ({ ctx, input }) => {
    const start = periodStart(input.period);
    const rows = await db
      .select({
        categoryId: expenses.categoryId,
        categoryName: categories.name,
        total: sql<number>`SUM(${expenses.amountCents})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(expenses)
      .leftJoin(categories, eq(categories.id, expenses.categoryId))
      .where(
        and(
          eq(expenses.tenantId, ctx.tenant.tenantId),
          gte(expenses.expenseDate, start),
          eq(expenses.status, "paid"),
        ),
      )
      .groupBy(expenses.categoryId, categories.name)
      .orderBy(desc(sql`SUM(${expenses.amountCents})`));
    return rows.map((r) => ({
      categoryId: r.categoryId,
      name: r.categoryName ?? "Sem categoria",
      totalCents: Number(r.total ?? 0),
      count: Number(r.count ?? 0),
    }));
  }),

  /** Resumo do "dinheiro do mês" — receitas, despesas, saldo. */
  cashflow: tenantReadProcedure.input(periodSchema).query(async ({ ctx, input }) => {
    const start = periodStart(input.period);
    const [agg] = await db
      .select({
        in: sql<number>`COALESCE(SUM(CASE WHEN ${payments.direction}='in' THEN ${payments.amountCents} ELSE 0 END), 0)`,
        out: sql<number>`COALESCE(SUM(CASE WHEN ${payments.direction}='out' THEN ${payments.amountCents} ELSE 0 END), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(payments)
      .where(and(eq(payments.tenantId, ctx.tenant.tenantId), gte(payments.paidAt, start)));

    const recent = await db
      .select({
        id: payments.id,
        direction: payments.direction,
        amountCents: payments.amountCents,
        paymentMethod: payments.paymentMethod,
        paidAt: payments.paidAt,
        notes: payments.notes,
        source: payments.source,
      })
      .from(payments)
      .where(and(eq(payments.tenantId, ctx.tenant.tenantId), gte(payments.paidAt, start)))
      .orderBy(desc(payments.paidAt))
      .limit(30);

    return {
      inCents: Number(agg.in ?? 0),
      outCents: Number(agg.out ?? 0),
      balanceCents: Number(agg.in ?? 0) - Number(agg.out ?? 0),
      count: Number(agg.count ?? 0),
      recent,
    };
  }),
});
