/**
 * Worker `whatsapp:outbound` — envia mensagem do agente via Z-API.
 *
 * - Rate limit 1 msg / 4s POR INSTÂNCIA do worker (configurado no Worker).
 * - Adiciona rodapé LGPD na 1ª outbound do agente para um contato.
 * - Persiste o registro em whatsapp_messages (direction=outbound, sender=agent).
 */

import type { Job } from "bullmq";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { contacts, tenants, whatsappMessages } from "@/server/db/schema";
import { lgpdOptOutFooter } from "@/server/lib/lgpd";
import { logger } from "@/server/lib/logger";
import { sendText } from "@/server/lib/zapi";
import type { OutboundJob } from "@/server/queues/payloads";

async function isFirstAgentOutboundForPhone(tenantId: string, phone: string): Promise<boolean> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.tenantId, tenantId),
        eq(whatsappMessages.direction, "outbound"),
        eq(whatsappMessages.toNumber, phone),
      ),
    );
  return value === 0;
}

async function resolvePhone(job: Job<OutboundJob>): Promise<string | null> {
  if (job.data.phone) return job.data.phone;
  if (!job.data.replyToMessageId) return null;
  const [msg] = await db
    .select({ from: whatsappMessages.fromNumber })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.id, job.data.replyToMessageId))
    .limit(1);
  return msg?.from ?? null;
}

export async function processOutbound(job: Job<OutboundJob>): Promise<{ status: string }> {
  const { tenantId, text } = job.data;
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error("tenant missing");
  if (!tenant.zapiInstanceId || !tenant.zapiInstanceToken || !tenant.zapiClientToken) {
    logger.warn({ tenantId }, "[outbound] tenant missing Z-API creds — dropping");
    return { status: "no_creds" };
  }
  if (tenant.status !== "active") return { status: "tenant_not_active" };

  const phone = await resolvePhone(job);
  if (!phone) {
    logger.warn({ tenantId, jobId: job.id }, "[outbound] no phone to send to");
    return { status: "no_phone" };
  }

  // Bloqueia se o contato pediu opt-out
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.phone, phone)))
    .limit(1);
  if (contact?.lgpdOptedOutAt) {
    logger.info({ tenantId, phone }, "[outbound] opted-out — drop");
    return { status: "opted_out" };
  }

  let finalText = text;
  if (await isFirstAgentOutboundForPhone(tenantId, phone)) {
    finalText = `${text}\n\n${lgpdOptOutFooter()}`;
  }

  const res = await sendText(
    {
      instanceId: tenant.zapiInstanceId,
      instanceToken: tenant.zapiInstanceToken,
      clientToken: tenant.zapiClientToken,
    },
    phone,
    finalText,
  );

  await db.insert(whatsappMessages).values({
    tenantId,
    direction: "outbound",
    fromNumber: tenant.zapiInstanceId,
    toNumber: phone,
    messageType: "text",
    rawContent: finalText,
    zapiMessageId: res.zapiMessageId,
    whatsappStatus: "sent",
    processingStatus: "responded",
    contactId: contact?.id ?? null,
  });

  return { status: "sent" };
}
