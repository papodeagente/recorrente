/**
 * Extractor — uma única chamada Claude que CLASSIFICA + EXTRAI.
 *
 * Devolve um JSON consistente com o schema da §"INTELIGÊNCIA DA IA" do
 * prompt fundacional. Tudo está em centavos para evitar float.
 */

import { ANTHROPIC_MODELS, anthropic } from "@/server/lib/anthropic";
import { logger } from "@/server/lib/logger";

export type IntentKind =
  | "register_sale"
  | "register_expense"
  | "register_payable"
  | "register_receivable"
  | "register_payment_received"
  | "register_payment_made"
  | "create_contact"
  | "update_contact"
  | "create_task"
  | "query_revenue_today"
  | "query_overdue"
  | "query_expenses_today"
  | "query_summary"
  | "correct_last"
  | "cancel_last"
  | "add_note"
  | "other"
  | "unknown";

export type ExtractedSale = {
  contact?: { name?: string | null; phone?: string | null };
  items?: Array<{ description: string; quantity?: number; unit_price_cents?: number; total_cents?: number; product_match_hint?: string | null }>;
  total_amount_cents?: number | null;
  paid_amount_cents?: number | null;
  pending_amount_cents?: number | null;
  payment_method?: string | null;
  due_date_iso?: string | null;
  notes?: string | null;
};

export type ExtractedExpense = {
  supplier_name?: string | null;
  description?: string | null;
  amount_cents?: number | null;
  payment_method?: string | null;
  date_iso?: string | null;
  expense_category?: string | null;
  notes?: string | null;
};

export type ExtractedPayment = {
  contact?: { name?: string | null; phone?: string | null };
  amount_cents?: number | null;
  payment_method?: string | null;
  date_iso?: string | null;
  notes?: string | null;
};

export type ExtractionResult = {
  intent: IntentKind;
  confidence: number; // 0..1
  needs_confirmation: boolean;
  reply_to_user: string; // o que o agente deve responder no WhatsApp
  sale?: ExtractedSale;
  expense?: ExtractedExpense;
  payment?: ExtractedPayment;
  contact?: { name?: string | null; phone?: string | null; notes?: string | null };
  task?: { title?: string; due_iso?: string | null; contact_phone?: string | null };
  query_answer_hint?: string | null;
  notes?: string | null;
  raw_text: string;
};

type ContextHint = {
  businessName: string;
  businessType: string;
  aiPersonaName: string;
  aiTone: "amigavel" | "profissional" | "descolado";
  knownProductNames: string[]; // só nomes (incluindo aliases já achatados)
  knownCategories: { income: string[]; expense: string[] };
  knownPaymentMethods: string[];
  recentContacts?: Array<{ name: string | null; phone: string }>;
};

function systemPrompt(ctx: ContextHint): string {
  return [
    `Você é "${ctx.aiPersonaName}" do negócio "${ctx.businessName}" (${ctx.businessType}).`,
    `Sua função: ler a mensagem do dono do negócio (texto ou áudio transcrito) e extrair os dados estruturados pra registrar no CRM e no financeiro.`,
    `Tom: ${ctx.aiTone}. Responda SEMPRE em português brasileiro, curto e direto.`,
    ``,
    `REGRAS DE OURO:`,
    `- NUNCA invente valor, telefone, nome ou data. Se faltar, retorne null e peça no campo reply_to_user.`,
    `- Valores SEMPRE em centavos (R$ 50,00 → 5000). NUNCA float.`,
    `- Data ISO 8601 (YYYY-MM-DD ou YYYY-MM-DDTHH:mm) quando relevante.`,
    `- Telefones em E.164 (+55DDDNUMERO). Se vier "84 99999-9999" infira DDI 55 → "+5584999999999".`,
    `- Métodos de pagamento permitidos: ${ctx.knownPaymentMethods.join(", ")}.`,
    `- Categorias de despesa disponíveis: ${ctx.knownCategories.expense.join(", ")}.`,
    `- Produtos cadastrados: ${ctx.knownProductNames.slice(0, 50).join(", ") || "(nenhum)"}. Use product_match_hint pra sugerir match.`,
    ``,
    `INTENTS POSSÍVEIS (escolha exatamente uma):`,
    `register_sale | register_expense | register_payable | register_receivable | register_payment_received | register_payment_made | create_contact | update_contact | create_task | query_revenue_today | query_overdue | query_expenses_today | query_summary | correct_last | cancel_last | add_note | other | unknown`,
    ``,
    `CONFIDENCE:`,
    `- 0.90+ : tudo claro, sem ambiguidade.`,
    `- 0.70-0.89 : entendi, mas falta 1 campo importante (peça no reply_to_user).`,
    `- 0.50-0.69 : ambíguo, peça confirmação.`,
    `- <0.50 : não tenho certeza. Marque needs_confirmation=true e seja sincero no reply_to_user.`,
    ``,
    `REPLY_TO_USER:`,
    `- 1-3 linhas, conversacional.`,
    `- Se vai lançar: confirme curto ("Pronto, registrei…").`,
    `- Se vai pedir confirmação: pergunte UMA coisa por vez.`,
    `- Se vai pedir info faltando: pergunte UMA coisa por vez.`,
    `- NUNCA diga que é robô/IA/assistente virtual.`,
    ``,
    `SAÍDA: APENAS um JSON válido, sem markdown, sem comentários, sem texto fora do JSON. Schema:`,
    `{`,
    `  "intent": <IntentKind>,`,
    `  "confidence": number,                  // 0..1`,
    `  "needs_confirmation": boolean,`,
    `  "reply_to_user": string,`,
    `  "sale": { /* quando intent inclui sale */`,
    `    "contact": { "name": string|null, "phone": string|null },`,
    `    "items": [{ "description": string, "quantity": number?, "unit_price_cents": number?, "total_cents": number?, "product_match_hint": string|null }],`,
    `    "total_amount_cents": number|null,`,
    `    "paid_amount_cents": number|null,`,
    `    "pending_amount_cents": number|null,`,
    `    "payment_method": string|null,`,
    `    "due_date_iso": string|null,`,
    `    "notes": string|null`,
    `  },`,
    `  "expense": { "supplier_name": string|null, "description": string|null, "amount_cents": number|null, "payment_method": string|null, "date_iso": string|null, "expense_category": string|null, "notes": string|null },`,
    `  "payment": { "contact": { "name": string|null, "phone": string|null }, "amount_cents": number|null, "payment_method": string|null, "date_iso": string|null, "notes": string|null },`,
    `  "contact": { "name": string|null, "phone": string|null, "notes": string|null },`,
    `  "task": { "title": string, "due_iso": string|null, "contact_phone": string|null },`,
    `  "query_answer_hint": string|null,`,
    `  "notes": string|null`,
    `}`,
    `Inclua somente as chaves relevantes ao intent. Sempre inclua intent, confidence, needs_confirmation, reply_to_user.`,
  ].join("\n");
}

export async function extractFromText(input: {
  text: string;
  ctx: ContextHint;
  sourceLabel?: "text" | "audio" | "image";
}): Promise<{ result: ExtractionResult; promptUsed: string; raw: unknown }> {
  const promptUsed = systemPrompt(input.ctx);

  const res = await anthropic().messages.create({
    model: ANTHROPIC_MODELS.sonnet,
    max_tokens: 800,
    system: promptUsed,
    messages: [
      {
        role: "user",
        content:
          `MENSAGEM (origem: ${input.sourceLabel ?? "text"}):\n"""\n${input.text}\n"""\n\n` +
          `Extraia em JSON conforme o schema.`,
      },
    ],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();

  let parsed: ExtractionResult;
  try {
    const cleaned = text
      .replace(/^```json\n?/i, "")
      .replace(/^```\n?/i, "")
      .replace(/```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned) as ExtractionResult;
    parsed.raw_text = input.text;
    parsed.confidence = clamp(Number(parsed.confidence ?? 0));
    parsed.needs_confirmation = Boolean(parsed.needs_confirmation);
    if (typeof parsed.reply_to_user !== "string" || !parsed.reply_to_user.trim()) {
      parsed.reply_to_user = "Recebi sua mensagem.";
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, sample: text.slice(0, 200) }, "[extractor] parse failed");
    parsed = {
      intent: "unknown",
      confidence: 0,
      needs_confirmation: true,
      reply_to_user: "Não consegui entender bem. Pode reescrever de outro jeito?",
      raw_text: input.text,
    };
  }
  return { result: parsed, promptUsed, raw: res };
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
