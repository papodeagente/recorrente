/**
 * Worker `whatsapp:inbound` — processa eventos da Z-API.
 *
 * Responsabilidades:
 * - Parsear payload (extrair phone, text, messageId, ts)
 * - Find or create customer (com firstContactAt)
 * - Find or create conversation
 * - Detectar opt-out (LGPD) → marca + envia confirmação ÚNICA + sai
 * - Detectar opt-in ("voltar") → limpa opted_out_at
 * - Persistir message inbound
 * - Classificar resposta (Haiku): se há scheduled_action recente do tipo
 *   recurrence_nudge esperando reply, classifica engajamento e atualiza status
 * - Caso contrário (mensagem livre), enfileira `agent:reason` com intent=free_reply
 */

import type { Job } from "bullmq";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  agentDecisions,
  conversations,
  customers,
  messages,
  scheduledActions,
} from "@/server/db/schema";
import { classifyIntent } from "@/server/lib/intent-classifier";
import { isOptInMessage, isOptOutMessage, lgpdOptOutConfirmation } from "@/server/lib/lgpd";
import { logger } from "@/server/lib/logger";
import { tenantDb } from "@/server/lib/tenant-context";
import type { InboundJob, OutboundJob } from "@/server/queues/payloads";
import { getQueue, QUEUES } from "@/server/queues";

type ZapiText = {
  phone?: string;
  fromMe?: boolean;
  text?: { message?: string } | string;
  message?: string;
  messageId?: string;
  id?: string;
  momment?: number; // sic — Z-API typo
  moment?: number;
};

function extractPhone(p: Record<string, unknown>): string | null {
  const phone = (p as ZapiText).phone ?? null;
  if (!phone) return null;
  // Normaliza para E.164 com '+'. Z-API costuma mandar só dígitos.
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  return `+${digits}`;
}

function extractText(p: Record<string, unknown>): string | null {
  const z = p as ZapiText;
  if (typeof z.text === "string") return z.text;
  if (z.text && typeof z.text === "object" && typeof z.text.message === "string") return z.text.message;
  if (typeof z.message === "string") return z.message;
  return null;
}

function extractMessageId(p: Record<string, unknown>): string | null {
  const z = p as ZapiText;
  return z.messageId ?? z.id ?? null;
}

function isFromMe(p: Record<string, unknown>): boolean {
  return Boolean((p as ZapiText).fromMe);
}

export async function processInbound(job: Job<InboundJob>): Promise<{ status: string }> {
  const { tenantId, payload } = job.data;
  const t = tenantDb(tenantId);

  if (isFromMe(payload)) {
    // Mensagem que NÓS enviamos (echo). Ignorar.
    return { status: "ignored_self" };
  }

  const phone = extractPhone(payload);
  const text = extractText(payload);
  const zapiMessageId = extractMessageId(payload);
  if (!phone || !text) {
    logger.warn({ tenantId, payload }, "[inbound] missing phone/text");
    return { status: "ignored_malformed" };
  }

  // upsert customer
  let customer = await t.findFirst(customers, eq(customers.phone, phone));
  if (!customer) {
    const [created] = await t.insert(customers, {
      phone,
      firstContactAt: new Date(),
    });
    customer = created;
  }

  // upsert conversation
  let conversation = await t.findFirst(conversations, eq(conversations.customerId, customer.id));
  if (!conversation) {
    const [created] = await t.insert(conversations, {
      customerId: customer.id,
      status: "open",
      lastMessageAt: new Date(),
    });
    conversation = created;
  }

  // persiste a inbound (idempotente via UNIQUE de zapi_message_id)
  try {
    await t.insert(messages, {
      conversationId: conversation.id,
      direction: "inbound",
      sender: "customer",
      content: text,
      zapiMessageId: zapiMessageId ?? undefined,
    });
  } catch (err) {
    // Provavelmente UNIQUE violation (mesmo zapi_message_id processado 2x).
    logger.info({ tenantId, zapiMessageId, err: (err as Error).message }, "[inbound] duplicate message skipped");
    return { status: "duplicate" };
  }

  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), unreadCount: sql`${conversations.unreadCount} + 1`, updatedAt: new Date() })
    .where(eq(conversations.id, conversation.id));

  // ─── opt-out LGPD ───
  if (isOptOutMessage(text)) {
    await db
      .update(customers)
      .set({ lgpdOptedOutAt: new Date(), updatedAt: new Date() })
      .where(eq(customers.id, customer.id));
    await getQueue(QUEUES.whatsappOutbound).add(
      "lgpd-confirm",
      {
        tenantId,
        customerId: customer.id,
        conversationId: conversation.id,
        text: lgpdOptOutConfirmation(),
      } satisfies OutboundJob,
    );
    await db.insert(agentDecisions).values({
      tenantId,
      customerId: customer.id,
      conversationId: conversation.id,
      decision: "not_sent",
      reason: "lgpd_opt_out_detected",
      context: { trigger: "inbound_keyword" },
    });
    return { status: "opted_out" };
  }

  // ─── opt-in ("voltar") ───
  if (isOptInMessage(text) && customer.lgpdOptedOutAt) {
    await db
      .update(customers)
      .set({ lgpdOptedOutAt: null, updatedAt: new Date() })
      .where(eq(customers.id, customer.id));
  }

  // ─── há scheduled_action recente esperando reply? ───
  const recent = await db
    .select()
    .from(scheduledActions)
    .where(
      and(
        eq(scheduledActions.tenantId, tenantId),
        eq(scheduledActions.customerId, customer.id),
        eq(scheduledActions.status, "sent"),
        gt(scheduledActions.sentAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        isNull(scheduledActions.repliedAt),
      ),
    )
    .orderBy(desc(scheduledActions.sentAt))
    .limit(1);

  if (recent[0]) {
    const action = recent[0];
    const classification = await classifyIntent({
      message: text,
      categories: ["aceitou", "negou", "outro"] as const,
      description:
        'O cliente recebeu uma mensagem nossa convidando para marcar serviço. Classifique a resposta dele.',
      defaultTo: "outro",
    });

    const next: Partial<typeof scheduledActions.$inferInsert> = {
      repliedAt: new Date(),
      updatedAt: new Date(),
    };
    if (classification.category === "aceitou") {
      next.status = "converted";
      next.convertedAt = new Date();
    } else if (classification.category === "negou") {
      next.status = "replied";
    } else {
      next.status = "replied";
    }
    await db.update(scheduledActions).set(next).where(eq(scheduledActions.id, action.id));
    await db.insert(agentDecisions).values({
      tenantId,
      customerId: customer.id,
      conversationId: conversation.id,
      relatedActionId: action.id,
      decision: classification.fallback ? "not_sent" : "sent",
      reason: `inbound_reply_classified_${classification.category}`,
      llmModel: "haiku",
      promptInput: { message: text },
      llmResponse: { category: classification.category, raw: classification.raw },
    });
    // Resposta livre do agente fica para o pilar 4 (inbox). Por ora retornamos.
    return { status: `reply_${classification.category}` };
  }

  // ─── conversa livre (sem ação pendente): fica para o pilar de inbox.
  // Por enquanto só logamos.
  logger.info({ tenantId, customerId: customer.id }, "[inbound] free message — not auto-replied in this phase");
  return { status: "free_message" };
}
