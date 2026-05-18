import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { mediaAttachments, tenants, whatsappMessages } from "@/server/db/schema";
import { logger } from "@/server/lib/logger";
import { saveBuffer } from "@/server/lib/storage/local";
import { downloadMedia, verifyWebhookToken } from "@/server/lib/zapi";
import { getQueue, QUEUES } from "@/server/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { instanceId: string } };

type ZapiPayload = {
  phone?: string;
  fromMe?: boolean;
  messageId?: string;
  text?: { message?: string } | string;
  message?: string;
  audio?: { audioUrl?: string; mimeType?: string };
  image?: { imageUrl?: string; caption?: string; mimeType?: string };
};

function classifyType(p: ZapiPayload): "text" | "audio" | "image" | "unknown" {
  if (p.audio?.audioUrl) return "audio";
  if (p.image?.imageUrl) return "image";
  if (p.text || p.message) return "text";
  return "unknown";
}

function extractPhone(p: ZapiPayload): string | null {
  if (!p.phone) return null;
  const digits = String(p.phone).replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

function extractText(p: ZapiPayload): string | null {
  if (typeof p.text === "string") return p.text;
  if (typeof p.text === "object" && p.text?.message) return p.text.message;
  if (typeof p.message === "string") return p.message;
  return null;
}

export async function POST(req: Request, { params }: Params) {
  const { instanceId } = params;
  if (!instanceId) return NextResponse.json({ error: "missing instance" }, { status: 400 });

  const [tenant] = await db
    .select({
      id: tenants.id,
      clientToken: tenants.zapiClientToken,
      status: tenants.status,
    })
    .from(tenants)
    .where(eq(tenants.zapiInstanceId, instanceId))
    .limit(1);
  if (!tenant) {
    logger.warn({ instanceId }, "[webhook] unknown z-api instance");
    return NextResponse.json({ error: "unknown instance" }, { status: 404 });
  }

  const received = req.headers.get("Client-Token") ?? req.headers.get("client-token");
  if (!verifyWebhookToken(received, tenant.clientToken)) {
    logger.warn({ tenantId: tenant.id, instanceId }, "[webhook] invalid token");
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  if (tenant.status !== "active") {
    return NextResponse.json({ ok: true, dropped: true });
  }

  const payload = (await req.json().catch(() => null)) as ZapiPayload | null;
  if (!payload) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  if (payload.fromMe) return NextResponse.json({ ok: true, skipped: "self" });

  const phone = extractPhone(payload);
  const type = classifyType(payload);
  if (!phone || type === "unknown") {
    return NextResponse.json({ ok: true, ignored: true, reason: "missing_phone_or_type" });
  }

  // ── baixa mídia (audio/image) e salva local ──
  let mediaKey: string | null = null;
  let mediaMime: string | null = null;
  let mediaCaption: string | null = null;
  try {
    if (type === "audio" && payload.audio?.audioUrl) {
      const dl = await downloadMedia(payload.audio.audioUrl);
      const file = await saveBuffer(tenant.id, dl.buffer, {
        mime: payload.audio.mimeType ?? dl.mime ?? "audio/ogg",
      });
      mediaKey = file.storageKey;
      mediaMime = payload.audio.mimeType ?? dl.mime ?? "audio/ogg";
    }
    if (type === "image" && payload.image?.imageUrl) {
      const dl = await downloadMedia(payload.image.imageUrl);
      const file = await saveBuffer(tenant.id, dl.buffer, {
        mime: payload.image.mimeType ?? dl.mime ?? "image/jpeg",
      });
      mediaKey = file.storageKey;
      mediaMime = payload.image.mimeType ?? dl.mime ?? "image/jpeg";
      mediaCaption = payload.image.caption ?? null;
    }
  } catch (err) {
    logger.warn({ tenantId: tenant.id, err: (err as Error).message }, "[webhook] media download failed");
  }

  const text = extractText(payload) ?? mediaCaption ?? null;

  // ── persiste whatsapp_messages ──
  try {
    const [msg] = await db
      .insert(whatsappMessages)
      .values({
        tenantId: tenant.id,
        direction: "inbound",
        fromNumber: phone,
        messageType: type,
        rawContent: text,
        mediaUrl: mediaKey,
        zapiMessageId: payload.messageId ?? null,
        whatsappStatus: "received",
        processingStatus: "received",
        receivedAt: new Date(),
      })
      .returning();

    if (mediaKey) {
      await db.insert(mediaAttachments).values({
        tenantId: tenant.id,
        sourceMessageId: msg.id,
        kind: type === "audio" ? "audio" : type === "image" ? "image" : "other",
        storageUrl: mediaKey,
        mimeType: mediaMime,
        meta: {} as never,
      });
    }

    await getQueue(QUEUES.whatsappInbound).add(
      "inbound",
      { tenantId: tenant.id, messageId: msg.id },
      { jobId: `inb:${msg.id}`, removeOnComplete: { age: 3600, count: 1000 }, attempts: 3 },
    );
    return NextResponse.json({ ok: true, messageId: msg.id });
  } catch (err) {
    // UNIQUE violation no zapi_message_id = mensagem duplicada → ignora.
    logger.info({ tenantId: tenant.id, err: (err as Error).message }, "[webhook] insert message failed");
    return NextResponse.json({ ok: true, duplicate: true });
  }
}
