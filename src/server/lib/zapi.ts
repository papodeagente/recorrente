/**
 * Z-API — cliente minimalista para enviar mensagens via instância de um tenant.
 *
 * Doc Z-API: https://developer.z-api.io/
 *
 * Cada tenant tem seu próprio par (instanceId, instanceToken, clientToken)
 * em `tenants.zapi_*`. Sempre carregue esses valores do banco antes de chamar.
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
    headers: {
      "Content-Type": "application/json",
      "Client-Token": creds.clientToken,
    },
    body: JSON.stringify({ phone, message }),
  });
  const raw = (await res.json().catch(() => null)) as { messageId?: string; id?: string } | null;
  if (!res.ok) {
    logger.warn({ status: res.status, raw }, "[zapi] send-text non-2xx");
    throw new Error(`Z-API send-text failed: ${res.status}`);
  }
  return { zapiMessageId: raw?.messageId ?? raw?.id ?? null, raw };
}

/**
 * Verifica o token enviado pela Z-API no header do webhook.
 * O token compartilhado é configurado no painel da Z-API por instância e
 * persistido no tenant via `tenants.zapi_client_token`.
 */
export function verifyWebhookToken(received: string | null, expected: string | null): boolean {
  if (!received || !expected) return false;
  // Comparação simples; não há risco de timing significativo aqui dado o
  // contexto, mas trocar por timingSafeEqual quando o volume crescer.
  return received === expected;
}
