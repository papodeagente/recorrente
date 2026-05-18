import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  aiExtractions,
  contacts,
  expenses,
  payables,
  receivables,
  sales,
  whatsappMessages,
} from "@/server/db/schema";
import { router, tenantReadProcedure } from "@/server/trpc/init";

export const dashboardRouter = router({
  kpis: tenantReadProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setHours(23, 59, 59, 999);

    const [salesToday] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${sales.totalAmountCents}), 0)`,
        paid: sql<number>`COALESCE(SUM(${sales.paidAmountCents}), 0)`,
        pending: sql<number>`COALESCE(SUM(${sales.pendingAmountCents}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.tenantId, tenantId),
          gte(sales.saleDate, startOfToday),
          sql`${sales.paymentStatus} <> 'cancelled'`,
        ),
      );

    const [recvDueToday] = await db
      .select({ total: sql<number>`COALESCE(SUM(${receivables.amountPendingCents}), 0)` })
      .from(receivables)
      .where(
        and(
          eq(receivables.tenantId, tenantId),
          sql`${receivables.status} IN ('open','partial')`,
          gte(receivables.dueDate, startOfToday),
          sql`${receivables.dueDate} <= ${endOfToday}`,
        ),
      );

    const [recvOverdue] = await db
      .select({ total: sql<number>`COALESCE(SUM(${receivables.amountPendingCents}), 0)`, count: sql<number>`COUNT(*)` })
      .from(receivables)
      .where(
        and(
          eq(receivables.tenantId, tenantId),
          sql`${receivables.status} IN ('open','partial','overdue')`,
          sql`${receivables.dueDate} < ${startOfToday}`,
        ),
      );

    const [payDueToday] = await db
      .select({ total: sql<number>`COALESCE(SUM(${payables.amountCents} - ${payables.amountPaidCents}), 0)`, count: sql<number>`COUNT(*)` })
      .from(payables)
      .where(
        and(
          eq(payables.tenantId, tenantId),
          sql`${payables.status} IN ('open','partial')`,
          gte(payables.dueDate, startOfToday),
          sql`${payables.dueDate} <= ${endOfToday}`,
        ),
      );

    const [expMonth] = await db
      .select({ total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.tenantId, tenantId),
          eq(expenses.status, "paid"),
          sql`${expenses.expenseDate} >= date_trunc('month', NOW())`,
        ),
      );

    const [newCustomersToday] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), gte(contacts.createdAt, startOfToday)));

    const [pendingAi] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(aiExtractions)
      .where(and(eq(aiExtractions.tenantId, tenantId), eq(aiExtractions.status, "pending")));

    const avgTicket =
      Number(salesToday.count ?? 0) > 0
        ? Number(salesToday.total ?? 0) / Number(salesToday.count)
        : 0;

    return {
      vendidoHojeCents: Number(salesToday.total ?? 0),
      recebidoHojeCents: Number(salesToday.paid ?? 0),
      aReceberHojeCents: Number(recvDueToday.total ?? 0),
      atrasadoCents: Number(recvOverdue.total ?? 0),
      atrasadoCount: Number(recvOverdue.count ?? 0),
      aPagarHojeCents: Number(payDueToday.total ?? 0),
      aPagarHojeCount: Number(payDueToday.count ?? 0),
      despesasDoMesCents: Number(expMonth.total ?? 0),
      novosClientesHojeCount: Number(newCustomersToday.count ?? 0),
      pendenciasIaCount: Number(pendingAi.count ?? 0),
      ticketMedioCents: Math.round(avgTicket),
      vendasHojeCount: Number(salesToday.count ?? 0),
    };
  }),

  recentMessages: tenantReadProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: whatsappMessages.id,
        direction: whatsappMessages.direction,
        messageType: whatsappMessages.messageType,
        rawContent: whatsappMessages.rawContent,
        transcription: whatsappMessages.transcription,
        aiResponse: whatsappMessages.aiResponse,
        processingStatus: whatsappMessages.processingStatus,
        receivedAt: whatsappMessages.receivedAt,
      })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.tenantId, ctx.tenant.tenantId))
      .orderBy(desc(whatsappMessages.receivedAt))
      .limit(15);
  }),

  attention: tenantReadProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const overdue = await db
      .select({
        id: receivables.id,
        contactName: contacts.name,
        amount: receivables.amountPendingCents,
        due: receivables.dueDate,
      })
      .from(receivables)
      .leftJoin(contacts, eq(contacts.id, receivables.contactId))
      .where(
        and(
          eq(receivables.tenantId, tenantId),
          sql`${receivables.status} IN ('open','partial','overdue')`,
          sql`${receivables.dueDate} <= NOW()`,
        ),
      )
      .orderBy(receivables.dueDate)
      .limit(10);

    const payableSoon = await db
      .select({ id: payables.id, supplier: payables.supplierName, description: payables.description, amount: payables.amountCents, due: payables.dueDate })
      .from(payables)
      .where(
        and(
          eq(payables.tenantId, tenantId),
          sql`${payables.status} IN ('open','partial')`,
          sql`${payables.dueDate} <= NOW() + INTERVAL '3 day'`,
        ),
      )
      .orderBy(payables.dueDate)
      .limit(10);

    const pending = await db
      .select({
        id: aiExtractions.id,
        intent: aiExtractions.intent,
        confidence: aiExtractions.confidence,
        createdAt: aiExtractions.createdAt,
      })
      .from(aiExtractions)
      .where(and(eq(aiExtractions.tenantId, tenantId), eq(aiExtractions.status, "pending")))
      .orderBy(desc(aiExtractions.createdAt))
      .limit(10);

    return { overdueReceivables: overdue, payableSoon, pendingAi: pending };
  }),
});
