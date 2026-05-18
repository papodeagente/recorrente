/**
 * Z-API — cliente para envio e download de mídia.
 *
 * Doc: https://developer.z-api.io/
 *
 * Cada tenant tem suas próprias credenciais em `tenants.zapi_*`. Sempre
 * carregue do banco antes de chamar.
 */

import { logger } from "@/server/lib/logger";

export type ZapiCredentials = {
  instanceId: string;
  instanceToken: string;
  clientToken: string;
};

export type ZapiSendTextResult = {
  zapiMessageId: string | null;
  raw: unknown;
};

function baseUrl(creds: ZapiCredentials): string {
  return `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.instanceToken}`;
}

export async function sendText(
  creds: ZapiCredentials,
  phone: string,
  message: string,
): Promise<ZapiSendTextResult> {
  const url = `${baseUrl(creds)}/send-text`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Client-Token": creds.clientToken },
    body: JSON.stringify({ phone, message }),
  });
  const raw = (await res.json().catch(() => null)) as
    | { messageId?: string; id?: string }
    | null;
  if (!res.ok) {
    logger.warn({ status: res.status, raw }, "[zapi] send-text non-2xx");
    throw new Error(`Z-API send-text failed: ${res.status}`);
  }
  return { zapiMessageId: raw?.messageId ?? raw?.id ?? null, raw };
}

export function verifyWebhookToken(received: string | null, expected: string | null): boolean {
  if (!received || !expected) return false;
  return received === expected;
}

/**
 * Baixa mídia anexada a uma mensagem da Z-API.
 * O webhook do Z-API pode incluir URL pública direta da mídia (ex.:
 * payload.audio.audioUrl, payload.image.imageUrl). Aqui aceitamos a URL
 * pronta e fazemos o GET. Se sua instância requerer endpoint específico,
 * estenda esta função.
 */
export async function downloadMedia(url: string): Promise<{ buffer: Buffer; mime: string | null }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`failed to download media: ${res.status}`);
  }
  const mime = res.headers.get("content-type");
  const arr = await res.arrayBuffer();
  return { buffer: Buffer.from(arr), mime: mime ?? null };
}
