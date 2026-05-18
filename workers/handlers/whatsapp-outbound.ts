/**
 * Worker `whatsapp:outbound` — envia texto via Z-API.
 *
 * Rate limit: 1 mensagem a cada 4 segundos POR INSTÂNCIA (§9 do prompt).
 * Atualmente assume um worker rodando — escalar para múltiplos workers no
 * futuro vai exigir limiter por tenant em Redis (não BullMQ default).
 *
 * Rodapé LGPD: anexa "_responda SAIR_" quando é a primeira outbound do agente
 * para o customer.
 */

import type { Job } from "bullmq";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { conversations, customers, messages, scheduledActions, tenants } from "@/server/db/schema";
import { lgpdOptOutFooter } from "@/server/lib/lgpd";
import { logger } from "@/server/lib/logger";
import { sendText } from "@/server/lib/zapi";
import type { OutboundJob } from "@/server/queues/payloads";

async function isFirstAgentOutboundForCustomer(input: {
  tenantId: string;
  customerId: string;
}): Promise<boolean> {
  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.tenantId, input.tenantId), eq(conversations.customerId, input.customerId)))
    .limit(1);
  if (!conv) return true;
  const [{ value }] = await db
    .select({ value: count() })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, input.tenantId),
        eq(messages.conversationId, conv.id),
        eq(messages.direction, "outbound"),
        eq(messages.sender, "agent"),
      ),
    );
  return value === 0;
}

export async function processOutbound(job: Job<OutboundJob>): Promise<{ status: string }> {
  const { tenantId, customerId, text, relatedActionId } = job.data;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) throw new Error("tenant missing");
  if (!tenant.zapiInstanceId || !tenant.zapiInstanceToken || !tenant.zapiClientToken) {
    logger.warn({ tenantId }, "[outbound] tenant missing Z-API creds, dropping");
    return { status: "no_creds" };
  }
  if (tenant.status !== "active") {
    return { status: "tenant_not_active" };
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
    .limit(1);
  if (!customer) throw new Error("customer missing");
  if (customer.lgpdOptedOutAt) {
    logger.info({ tenantId, customerId }, "[outbound] customer opted-out, drop");
    return { status: "opted_out" };
  }

  let finalText = text;
  if (await isFirstAgentOutboundForCustomer({ tenantId, customerId })) {
    finalText = `${text}\n\n${lgpdOptOutFooter()}`;
  }

  const res = await sendText(
    {
      instanceId: tenant.zapiInstanceId,
      instanceToken: tenant.zapiInstanceToken,
      clientToken: tenant.zapiClientToken,
    },
    customer.phone,
    finalText,
  );

  let conversation = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.tenantId, tenantId), eq(conversations.customerId, customerId)))
    .limit(1);
  if (!conversation[0]) {
    const [created] = await db
      .insert(conversations)
      .values({ tenantId, customerId, status: "open", lastMessageAt: new Date() })
      .returning({ id: conversations.id });
    conversation = [created];
  }

  await db.insert(messages).values({
    tenantId,
    conversationId: conversation[0].id,
    direction: "outbound",
    sender: "agent",
    content: finalText,
    zapiMessageId: res.zapiMessageId,
    relatedActionId,
    whatsappStatus: "sent",
  });

  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(conversations.id, conversation[0].id));

  if (relatedActionId) {
    await db
      .update(scheduledActions)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(scheduledActions.id, relatedActionId));
  }

  return { status: "sent" };
}
