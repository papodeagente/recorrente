import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { customers, serviceCatalog, visits } from "@/server/db/schema";
import { db } from "@/server/db/client";
import { tenantDb } from "@/server/lib/tenant-context";
import { cancelPendingActionsOfType, scheduleAction } from "@/server/lib/scheduler";
import { logger } from "@/server/lib/logger";
import { router, tenantReadProcedure, tenantWriteProcedure } from "@/server/trpc/init";

const visitInput = z.object({
  customerId: z.string(),
  serviceId: z.string(),
  visitedAt: z.date().default(() => new Date()),
  revenueCents: z.number().int().nonnegative().default(0),
  recordedVia: z.enum(["agent_auto", "owner_manual", "inbox_chat"]).default("owner_manual"),
  notes: z.string().max(1000).optional(),
  recoveredFromTaskId: z.string().optional(),
});

export const visitsRouter = router({
  list: tenantReadProcedure
    .input(z.object({ customerId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const t = tenantDb(ctx.tenant.tenantId);
      if (input?.customerId) {
        return t.raw
          .select()
          .from(visits)
          .where(sql`${visits.tenantId} = ${ctx.tenant.tenantId} AND ${visits.customerId} = ${input.customerId}`)
          .orderBy(desc(visits.visitedAt))
          .limit(50);
      }
      return t.raw
        .select()
        .from(visits)
        .where(eq(visits.tenantId, ctx.tenant.tenantId))
        .orderBy(desc(visits.visitedAt))
        .limit(50);
    }),

  /**
   * Cria visit + atualiza customer counters + cancela recorrência antiga +
   * agenda nova recorrência (BullMQ delayed).
   *
   * Side effects rodam em transação (DB) + enqueue best-effort (fora).
   * Limitação documentada em scheduler.ts.
   */
  create: tenantWriteProcedure.input(visitInput).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const t = tenantDb(tenantId);

    const service = await t.findFirst(serviceCatalog, eq(serviceCatalog.id, input.serviceId));
    if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Serviço não encontrado." });
    const customer = await t.findFirst(customers, eq(customers.id, input.customerId));
    if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });

    const visit = await db.transaction(async (tx) => {
      const [v] = await tx
        .insert(visits)
        .values({
          tenantId,
          customerId: input.customerId,
          serviceId: input.serviceId,
          visitedAt: input.visitedAt,
          revenueCents: input.revenueCents,
          recordedVia: input.recordedVia,
          notes: input.notes,
          recoveredFromTaskId: input.recoveredFromTaskId,
        })
        .returning();

      await tx
        .update(customers)
        .set({
          lastVisitAt: input.visitedAt,
          totalVisits: sql`${customers.totalVisits} + 1`,
          totalRevenueCents: sql`${customers.totalRevenueCents} + ${input.revenueCents}`,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, input.customerId));

      // Se essa visit veio de um recovery, marca o task como convertido.
      if (input.recoveredFromTaskId) {
        await tx.execute(
          sql`UPDATE scheduled_actions SET status = 'converted', converted_at = NOW(), updated_at = NOW() WHERE id = ${input.recoveredFromTaskId} AND tenant_id = ${tenantId}`,
        );
      }

      return v;
    });

    // Cancela recorrência pendente antiga (só a última visit vale).
    const cancelled = await cancelPendingActionsOfType({
      tenantId,
      customerId: input.customerId,
      actionType: "recurrence_nudge",
    });
    if (cancelled > 0) {
      logger.info({ tenantId, customerId: input.customerId, cancelled }, "[visits] cancelled previous recurrence nudges");
    }

    // Agenda nova recorrência.
    const scheduledFor = new Date(input.visitedAt.getTime() + service.recurrenceDays * 24 * 60 * 60 * 1000);
    const scheduled = await scheduleAction({
      tenantId,
      customerId: input.customerId,
      actionType: "recurrence_nudge",
      scheduledFor,
      context: {
        serviceId: service.id,
        serviceName: service.name,
        recurrenceDays: service.recurrenceDays,
        sourceVisitId: visit.id,
      },
    });

    return { visit, scheduledActionId: scheduled.id, recurrenceFor: scheduledFor };
  }),
});
