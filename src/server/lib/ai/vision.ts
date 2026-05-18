/**
 * Vision (OCR) — extrai dados de cupom fiscal / comprovante usando Claude Vision.
 *
 * Retorna um JSON estruturado com fornecedor, data, valor total, itens, etc.
 * + um campo `confidence` 0-1 que reflete a clareza da imagem.
 */

import { ANTHROPIC_MODELS, anthropic } from "@/server/lib/anthropic";
import { logger } from "@/server/lib/logger";

export type ReceiptExtraction = {
  supplier_name: string | null;
  cnpj: string | null;
  date_iso: string | null;
  total_cents: number | null;
  payment_method: string | null;
  items: Array<{ description: string; quantity?: number; total_cents?: number }>;
  raw_text: string | null;
  confidence: number;
  suggested_category: string | null;
  notes: string | null;
};

const SYSTEM = `Você é um leitor de cupons fiscais e comprovantes brasileiros.
Extraia os dados estruturados em JSON. Use exclusivamente o que vê na imagem.
Não invente. Quando faltar informação, retorne null no campo.

Saída OBRIGATÓRIA: APENAS um JSON válido, sem markdown, sem comentários, sem texto extra.

Schema esperado:
{
  "supplier_name": string | null,
  "cnpj": string | null,
  "date_iso": string | null,             // YYYY-MM-DD ou YYYY-MM-DDTHH:mm
  "total_cents": number | null,          // total em CENTAVOS (R$ 12,34 = 1234)
  "payment_method": "pix"|"cash"|"card_credit"|"card_debit"|"transfer"|"boleto"|null,
  "items": [{ "description": string, "quantity"?: number, "total_cents"?: number }],
  "raw_text": string | null,             // primeiras 500 chars do texto bruto
  "confidence": number,                  // 0..1, sua certeza de leitura
  "suggested_category": string | null,   // "Insumos","Mercadoria","Aluguel",etc.
  "notes": string | null
}`;

type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function normalizeImageMime(mime: string): SupportedImageMime {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "image/png";
  if (m.includes("webp")) return "image/webp";
  if (m.includes("gif")) return "image/gif";
  return "image/jpeg";
}

export async function extractReceipt(input: {
  imageBuffer: Buffer;
  mime: string;
  knownCategories?: string[];
}): Promise<ReceiptExtraction> {
  const base64 = input.imageBuffer.toString("base64");
  const mediaType = normalizeImageMime(input.mime);
  const knownHint = input.knownCategories?.length
    ? `\nCategorias disponíveis no negócio: ${input.knownCategories.join(", ")}. Escolha uma dessas para suggested_category quando fizer sentido.`
    : "";

  const res = await anthropic().messages.create({
    model: ANTHROPIC_MODELS.sonnet,
    max_tokens: 1024,
    system: SYSTEM + knownHint,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: "Extraia o cupom em JSON." },
        ],
      },
    ],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();

  try {
    const cleaned = text.replace(/^```json\n?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as ReceiptExtraction;
    return {
      supplier_name: parsed.supplier_name ?? null,
      cnpj: parsed.cnpj ?? null,
      date_iso: parsed.date_iso ?? null,
      total_cents:
        typeof parsed.total_cents === "number" ? Math.round(parsed.total_cents) : null,
      payment_method: parsed.payment_method ?? null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      raw_text: parsed.raw_text ?? null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      suggested_category: parsed.suggested_category ?? null,
      notes: parsed.notes ?? null,
    };
  } catch (err) {
    logger.error({ err: (err as Error).message, sample: text.slice(0, 200) }, "[vision] parse failed");
    return {
      supplier_name: null,
      cnpj: null,
      date_iso: null,
      total_cents: null,
      payment_method: null,
      items: [],
      raw_text: text.slice(0, 500),
      confidence: 0,
      suggested_category: null,
      notes: "Não foi possível interpretar a imagem.",
    };
  }
}
