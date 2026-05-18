/**
 * Worker `agent:reason` — gera mensagem com Claude Sonnet e encaminha
 * para `whatsapp:outbound`.
 *
 * Por enquanto cobre apenas `intent = recurrence_nudge`. Outras intents
 * (free_reply, recovery, referral_ask) entram nos próximos pilares.
 */

import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  agentDecisions,
  customers,
  scheduledActions,
  serviceCatalog,
  tenantSettings,
  tenants,
} from "@/server/db/schema";
import { ANTHROPIC_MODELS, anthropic } from "@/server/lib/anthropic";
import { buildAgentSystemPrompt, buildRecurrenceNudgePrompt } from "@/server/lib/agent-prompt";
import { logger } from "@/server/lib/logger";
import type { AgentReasonJob, OutboundJob } from "@/server/queues/payloads";
import { getQueue, QUEUES } from "@/server/queues";

async function generateRecurrenceMessage(input: {
  tenantId: string;
  scheduledActionId: string;
  customerId: string;
}): Promise<{ text: string; promptInput: unknown; llmResponse: unknown; relatedActionId: string }> {
  const [action] = await db
    .select()
    .from(scheduledActions)
    .where(and(eq(scheduledActions.tenantId, input.tenantId), eq(scheduledActions.id, input.scheduledActionId)))
    .limit(1);
  if (!action) throw new Error("scheduled_action not found");

  const ctx = (action.context ?? {}) as { serviceId?: string };
  if (!ctx.serviceId) throw new Error("scheduled_action context missing serviceId");

  const [service] = await db
    .select()
    .from(serviceCatalog)
    .where(and(eq(serviceCatalog.tenantId, input.tenantId), eq(serviceCatalog.id, ctx.serviceId)))
    .limit(1);
  if (!service) throw new Error("service not found");

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, input.tenantId), eq(customers.id, input.customerId)))
    .limit(1);
  if (!customer) throw new Error("customer not found");

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
  if (!tenant) throw new Error("tenant not found");

  const [settings] = await db
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, input.tenantId))
    .limit(1);
  if (!settings) throw new Error("tenant_settings missing");

  const system = buildAgentSystemPrompt({ tenant, settings });
  const user = buildRecurrenceNudgePrompt({ customer, service });

  const res = await anthropic().messages.create({
    model: ANTHROPIC_MODELS.sonnet,
    max_tokens: 200,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();

  return {
    text,
    promptInput: { system, user, model: ANTHROPIC_MODELS.sonnet },
    llmResponse: { stopReason: res.stop_reason, usage: res.usage, content: res.content },
    relatedActionId: action.id,
  };
}

export async function processAgentReason(job: Job<AgentReasonJob>): Promise<{ status: string }> {
  const { tenantId, intent, scheduledActionId, customerId } = job.data;

  if (intent !== "recurrence_nudge" || !scheduledActionId) {
    logger.info({ tenantId, intent }, "[agent:reason] intent not supported in pilar 1");
    return { status: "skipped_intent" };
  }

  try {
    const result = await generateRecurrenceMessage({ tenantId, scheduledActionId, customerId });

    if (!result.text || result.text.length < 5) {
      throw new Error("LLM returned empty/short message");
    }

    await db.insert(agentDecisions).values({
      tenantId,
      customerId,
      conversationId: job.data.conversationId,
      relatedActionId: result.relatedActionId,
      decision: "sent",
      reason: `intent_${intent}`,
      llmModel: ANTHROPIC_MODELS.sonnet,
      promptInput: result.promptInput as never,
      llmResponse: result.llmResponse as never,
    });

    await db
      .update(scheduledActions)
      .set({ generatedMessage: result.text, updatedAt: new Date() })
      .where(eq(scheduledActions.id, result.relatedActionId));

    await getQueue(QUEUES.whatsappOutbound).add(
      "agent-msg",
      {
        tenantId,
        customerId,
        conversationId: job.data.conversationId,
        text: result.text,
        relatedActionId: result.relatedActionId,
      } satisfies OutboundJob,
    );

    return { status: "queued_outbound" };
  } catch (err) {
    const message = (err as Error).message;
    logger.error({ tenantId, scheduledActionId, err: message }, "[agent:reason] failed");
    await db.insert(agentDecisions).values({
      tenantId,
      customerId,
      conversationId: job.data.conversationId,
      relatedActionId: scheduledActionId,
      decision: "not_sent",
      reason: `llm_error:${message.slice(0, 200)}`,
    });
    throw err; // deixa o BullMQ tentar retry
  }
}
