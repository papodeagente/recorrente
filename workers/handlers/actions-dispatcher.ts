/**
 * Worker `actions:dispatcher` — pega scheduled_action vencida e decide:
 *   1) aplica hard stops (§7.1). Se algum bate → não-envio + log + cancel.
 *   2) Caso contrário, enfileira `agent:reason` com contexto.
 *
 * Não envia mensagem diretamente — sempre passa pelo agent:reason que escreve
 * o texto e encaminha para outbound.
 */

import type { Job } from "bullmq";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  agentDecisions,
  conversations,
  customers,
  messages,
  scheduledActions,
  tenantSettings,
  tenants,
} from "@/server/db/schema";
import { isWithinBusinessHours, type BusinessHours } from "@/server/lib/business-hours";
import { logger } from "@/server/lib/logger";
import type { AgentReasonJob, DispatcherJob } from "@/server/queues/payloads";
import { getQueue, QUEUES } from "@/server/queues";

const TWELVE_HOURS = 12 * 60 * 60 * 1000;
const SIX_HOURS = 6 * 60 * 60 * 1000;

async function loadCtx(tenantId: string, scheduledActionId: string) {
  const [action] = await db
    .select()
    .from(scheduledActions)
    .where(and(eq(scheduledActions.tenantId, tenantId), eq(scheduledActions.id, scheduledActionId)))
    .limit(1);
  if (!action) return null;
  if (action.status !== "pending") return { action, reason: `non_pending_${action.status}` };

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) return { action, reason: "tenant_missing" };

  const [settings] = await db
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, action.customerId)))
    .limit(1);

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.tenantId, tenantId), eq(conversations.customerId, action.customerId)))
    .limit(1);

  return { action, tenant, settings, customer, conversation };
}

async function applyHardStops(ctx: NonNullable<Awaited<ReturnType<typeof loadCtx>>>): Promise<{ allowed: boolean; reason?: string }> {
  if ("reason" in ctx && ctx.reason) return { allowed: false, reason: ctx.reason };
  const { customer, settings, tenant, conversation } = ctx as {
    customer: typeof customers.$inferSelect;
    settings: typeof tenantSettings.$inferSelect | undefined;
    tenant: typeof tenants.$inferSelect;
    conversation: typeof conversations.$inferSelect | undefined;
  };

  if (!customer) return { allowed: false, reason: "customer_missing" };
  if (customer.lgpdOptedOutAt) return { allowed: false, reason: "lgpd_opted_out" };

  if (settings?.businessHours && !isWithinBusinessHours(settings.businessHours as BusinessHours, tenant.timezone)) {
    return { allowed: false, reason: "outside_business_hours" };
  }

  if (conversation?.agentPausedUntil && conversation.agentPausedUntil > new Date()) {
    return { allowed: false, reason: "conversation_paused" };
  }

  const pauseHours = settings?.autoPauseOnHumanReplyHours ?? 6;
  if (conversation?.lastHumanMessageAt) {
    const cutoff = new Date(Date.now() - pauseHours * 60 * 60 * 1000);
    if (conversation.lastHumanMessageAt > cutoff) {
      return { allowed: false, reason: "recent_human_reply" };
    }
  }

  // outbound do agente para este customer nas últimas 12h?
  if (conversation) {
    const recentOutbound = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, ctx.action.tenantId),
          eq(messages.conversationId, conversation.id),
          eq(messages.direction, "outbound"),
          eq(messages.sender, "agent"),
          gt(messages.createdAt, new Date(Date.now() - TWELVE_HOURS)),
        ),
      )
      .limit(1);
    if (recentOutbound[0]) return { allowed: false, reason: "recent_agent_outbound" };
  }

  return { allowed: true };
}

export async function processDispatch(job: Job<DispatcherJob>): Promise<{ status: string }> {
  const { tenantId, scheduledActionId } = job.data;
  const ctx = await loadCtx(tenantId, scheduledActionId);
  if (!ctx) {
    logger.warn({ tenantId, scheduledActionId }, "[dispatcher] action not found");
    return { status: "missing" };
  }
  if ("reason" in ctx && ctx.reason && !("customer" in ctx)) {
    logger.info({ tenantId, scheduledActionId, reason: ctx.reason }, "[dispatcher] aborted");
    return { status: ctx.reason };
  }

  const decision = await applyHardStops(ctx);

  if (!decision.allowed) {
    await db.insert(agentDecisions).values({
      tenantId,
      customerId: ctx.action.customerId,
      relatedActionId: ctx.action.id,
      decision: "not_sent",
      reason: decision.reason ?? "unknown",
      context: { actionType: ctx.action.actionType },
    });
    await db
      .update(scheduledActions)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(scheduledActions.id, ctx.action.id));
    return { status: `blocked_${decision.reason}` };
  }

  // Tudo OK → enfileira agent:reason.
  await getQueue(QUEUES.agentReason).add(
    String(ctx.action.actionType),
    {
      tenantId,
      scheduledActionId: ctx.action.id,
      conversationId: (ctx as { conversation?: { id: string } }).conversation?.id,
      customerId: ctx.action.customerId,
      intent: "recurrence_nudge",
    } satisfies AgentReasonJob,
  );
  return { status: "queued_for_reason" };
}

void SIX_HOURS; // referência mantida para futuras políticas
