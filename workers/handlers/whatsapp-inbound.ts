/**
 * Worker `whatsapp:inbound` — corre o pipeline IA (texto/áudio/imagem)
 * e enfileira a resposta em `whatsapp:outbound`.
 *
 * O webhook já gravou whatsapp_messages + opcionalmente baixou a mídia.
 * Aqui só passamos pro pipeline e empurramos a reply.
 */

import type { Job } from "bullmq";
import { runPipeline } from "@/server/lib/ai/pipeline";
import { logger } from "@/server/lib/logger";
import { getQueue, QUEUES } from "@/server/queues";
import type { InboundJob, OutboundJob } from "@/server/queues/payloads";

export async function processInbound(job: Job<InboundJob>): Promise<{ status: string }> {
  const { tenantId, messageId } = job.data;
  const out = await runPipeline({ tenantId, messageId });

  if (out.reply) {
    await getQueue(QUEUES.whatsappOutbound).add(
      "agent-reply",
      {
        tenantId,
        text: out.reply,
        replyToMessageId: messageId,
      } satisfies OutboundJob,
    );
  }
  logger.info({ tenantId, messageId, status: out.status }, "[inbound] pipeline done");
  return { status: out.status };
}
