/**
 * scheduler — cria scheduled_actions + enfileira jobs delayed BullMQ.
 *
 * Convenção:
 * - O caller decide o action_type e o `scheduled_for`.
 * - Esta função encapsula: insert na tabela + add no BullMQ com delay derivado
 *   de `scheduled_for - NOW()`. Se o tempo já passou, delay = 0 (dispara
 *   imediatamente; dispatcher decide se ainda faz sentido).
 *
 * Limitação conhecida (MVP):
 * - Não é transacional com o INSERT — se o processo cair entre commit e enqueue,
 *   o job não é agendado. Mitigação atual: o registro fica em `pending` e o
 *   cron actions:scheduler (Pilar 2) recupera. Sem scheduler, recuperação é manual.
 */

import { and, eq, ne, sql } from "drizzle-orm";
import { tenantDb } from "@/server/lib/tenant-context";
import { db } from "@/server/db/client";
import { scheduledActions, type NewScheduledAction } from "@/server/db/schema";
import { getQueue, QUEUES } from "@/server/queues";
import { logger } from "@/server/lib/logger";

type ScheduleInput = {
  tenantId: string;
  customerId: string;
  actionType: NewScheduledAction["actionType"];
  scheduledFor: Date;
  context?: Record<string, unknown>;
  attemptNumber?: number;
};

export async function scheduleAction(input: ScheduleInput): Promise<{ id: string }> {
  const [row] = await tenantDb(input.tenantId).insert(scheduledActions, {
    customerId: input.customerId,
    actionType: input.actionType,
    scheduledFor: input.scheduledFor,
    status: "pending",
    attemptNumber: input.attemptNumber ?? 1,
    context: (input.context ?? {}) as never,
  });

  const delayMs = Math.max(0, input.scheduledFor.getTime() - Date.now());
  try {
    const job = await getQueue(QUEUES.actionsDispatcher).add(
      input.actionType,
      { tenantId: input.tenantId, scheduledActionId: row.id },
      { delay: delayMs, jobId: `disp:${row.id}` },
    );
    await db
      .update(scheduledActions)
      .set({ bullJobId: String(job.id), updatedAt: new Date() })
      .where(eq(scheduledActions.id, row.id));
    logger.info(
      { tenantId: input.tenantId, scheduledActionId: row.id, delayMs },
      "[scheduler] enqueued",
    );
  } catch (err) {
    logger.error(
      { tenantId: input.tenantId, scheduledActionId: row.id, err: (err as Error).message },
      "[scheduler] enqueue failed — row remains pending for cron recovery",
    );
  }

  return { id: row.id };
}

/**
 * Cancela toda scheduled_action `pending` do mesmo (customer, actionType) que
 * não seja `excludeId`. Usado ao registrar nova visit para garantir que só a
 * recorrência da última visita conta.
 */
export async function cancelPendingActionsOfType(input: {
  tenantId: string;
  customerId: string;
  actionType: NewScheduledAction["actionType"];
  excludeId?: string;
}): Promise<number> {
  const where = and(
    eq(scheduledActions.tenantId, input.tenantId),
    eq(scheduledActions.customerId, input.customerId),
    eq(scheduledActions.actionType, input.actionType),
    eq(scheduledActions.status, "pending"),
    input.excludeId ? ne(scheduledActions.id, input.excludeId) : sql`TRUE`,
  );
  const res = await db
    .update(scheduledActions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(where);
  return res.rowCount ?? 0;
}
