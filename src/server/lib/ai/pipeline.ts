/**
 * Pipeline IA — recebe uma mensagem (texto/áudio/imagem) já persistida em
 * whatsapp_messages e devolve o que o agente vai responder.
 *
 * Etapas:
 *   1) Resolve texto (transcrição/OCR se necessário)
 *   2) Carrega contexto do tenant (produtos, categorias, settings)
 *   3) Extrai intent + JSON via Claude Sonnet
 *   4) Aplica regras de confirmação (business_settings)
 *   5) Auto-executa OU registra como pendente
 *   6) Atualiza whatsapp_message com processing_status + ai_response
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  aiExtractions,
  businessSettings,
  categories,
  contacts,
  expenses,
  payments,
  products,
  receivables,
  sales,
  tenants,
  whatsappMessages,
  type BusinessSettings,
  type Contact,
  type Tenant,
  type WhatsAppMessage,
} from "@/server/db/schema";
import { ANTHROPIC_MODELS } from "@/server/lib/anthropic";
import { logger } from "@/server/lib/logger";
import { readBuffer } from "@/server/lib/storage/local";
import { transcribeAudio } from "./whisper";
import { extractReceipt } from "./vision";
import { extractFromText, type ExtractionResult } from "./extractor";
import { execute } from "./executor";

export type PipelineInput = {
  tenantId: string;
  messageId: string;
  /** já populado se a mensagem é texto puro. Para audio/image, deixe undefined. */
  inboundText?: string;
};

export type PipelineOutput = {
  reply: string | null; // texto a enviar ao usuário (null = não responder)
  status: "launched" | "pending_confirmation" | "ignored" | "error" | "responded";
  extractionId?: string;
};

/** carrega tudo que o extractor precisa pra context window. */
async function loadCtx(tenantId: string): Promise<{
  tenant: Tenant;
  settings: BusinessSettings;
  productNames: string[];
  categories: { income: string[]; expense: string[] };
  paymentMethods: string[];
  recentContacts: Array<{ name: string | null; phone: string }>;
}> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error("tenant not found");
  let [settings] = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.tenantId, tenantId))
    .limit(1);
  if (!settings) {
    // fallback robusto: se faltou (edge case), cria settings com defaults.
    [settings] = await db.insert(businessSettings).values({ tenantId }).returning();
  }
  const prodRows = await db
    .select({ name: products.name, aliases: products.aliases })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)))
    .limit(200);
  const productNames = prodRows.flatMap((p) =>
    [p.name, ...(p.aliases ?? [])].filter(Boolean) as string[],
  );
  const catRows = await db
    .select({ kind: categories.kind, name: categories.name })
    .from(categories)
    .where(eq(categories.tenantId, tenantId))
    .limit(200);
  const cats = { income: [] as string[], expense: [] as string[] };
  for (const c of catRows) (c.kind === "income" ? cats.income : cats.expense).push(c.name);

  const recentContactRows = await db
    .select({ name: contacts.name, phone: contacts.phone })
    .from(contacts)
    .where(eq(contacts.tenantId, tenantId))
    .orderBy(desc(contacts.lastPurchaseAt))
    .limit(20);

  return {
    tenant,
    settings,
    productNames,
    categories: cats,
    paymentMethods: ["pix", "cash", "card_credit", "card_debit", "transfer", "boleto", "other"],
    recentContacts: recentContactRows.map((r) => ({ name: r.name, phone: r.phone })),
  };
}

/**
 * Determina se a extração deve auto-executar ou virar pendente, segundo
 * business_settings + tipo de origem + valor envolvido.
 */
function decideAutoExecute(input: {
  extraction: ExtractionResult;
  settings: BusinessSettings;
  sourceType: "text" | "audio" | "image";
  isNewCustomer: boolean;
}): { autoExecute: boolean; reason: string } {
  const { extraction, settings, sourceType, isNewCustomer } = input;

  if (extraction.intent === "unknown" || extraction.intent === "other") {
    return { autoExecute: false, reason: "intent_unknown" };
  }
  if (extraction.intent.startsWith("query_")) {
    return { autoExecute: true, reason: "query_no_side_effect" };
  }
  if (extraction.needs_confirmation) return { autoExecute: false, reason: "llm_requested_confirmation" };
  if (extraction.confidence < 0.7) return { autoExecute: false, reason: "low_confidence" };

  const amount =
    extraction.sale?.total_amount_cents ??
    extraction.expense?.amount_cents ??
    extraction.payment?.amount_cents ??
    0;

  if (amount >= settings.aiAlwaysConfirmAboveCents) {
    return { autoExecute: false, reason: "amount_above_always_confirm" };
  }
  if (amount > 0 && amount < settings.aiAutoConfirmBelowCents) {
    // baixo valor + alta confiança → libera
  } else if (amount >= settings.aiAutoConfirmBelowCents) {
    return { autoExecute: false, reason: "amount_above_auto_threshold" };
  }

  if (settings.aiAlwaysConfirmNewCustomer && isNewCustomer) {
    return { autoExecute: false, reason: "new_customer_requires_confirmation" };
  }
  if (settings.aiAlwaysConfirmReceiptImage && sourceType === "image") {
    return { autoExecute: false, reason: "receipt_image_requires_confirmation" };
  }
  if (sourceType === "audio" && !settings.aiAllowAudioAutoCreate) {
    return { autoExecute: false, reason: "audio_auto_disabled" };
  }
  return { autoExecute: true, reason: "ok" };
}

export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const { tenantId, messageId } = input;

  const [message] = await db
    .select()
    .from(whatsappMessages)
    .where(and(eq(whatsappMessages.tenantId, tenantId), eq(whatsappMessages.id, messageId)))
    .limit(1);
  if (!message) return { reply: null, status: "ignored" };

  await db
    .update(whatsappMessages)
    .set({ processingStatus: "processing", updatedAt: new Date() })
    .where(eq(whatsappMessages.id, messageId));

  try {
    // ---- Resolve texto da mensagem ----
    const resolved = await resolveText({ message, inboundTextOverride: input.inboundText });
    if (!resolved.text) {
      await db
        .update(whatsappMessages)
        .set({ processingStatus: "error", updatedAt: new Date() })
        .where(eq(whatsappMessages.id, messageId));
      return { reply: "Não consegui entender a mensagem. Pode reenviar?", status: "error" };
    }
    if (resolved.transcription) {
      await db
        .update(whatsappMessages)
        .set({ transcription: resolved.transcription, updatedAt: new Date() })
        .where(eq(whatsappMessages.id, messageId));
    }

    // ---- Carrega contexto + extrai ----
    const ctx = await loadCtx(tenantId);
    const { result, promptUsed, raw } = await extractFromText({
      text: resolved.text,
      sourceLabel: message.messageType === "audio" ? "audio" : message.messageType === "image" ? "image" : "text",
      ctx: {
        businessName: ctx.tenant.name,
        businessType: ctx.tenant.businessType,
        aiPersonaName: ctx.settings.aiPersonaName,
        aiTone: ctx.settings.aiTone as "amigavel" | "profissional" | "descolado",
        knownProductNames: ctx.productNames,
        knownCategories: ctx.categories,
        knownPaymentMethods: ctx.paymentMethods,
        recentContacts: ctx.recentContacts,
      },
    });

    // ---- Carrega contato pelo phone do remetente ----
    const senderContact = await findContactByPhone(tenantId, message.fromNumber);
    if (senderContact && !message.contactId) {
      await db
        .update(whatsappMessages)
        .set({ contactId: senderContact.id, updatedAt: new Date() })
        .where(eq(whatsappMessages.id, messageId));
    }

    // ---- Persiste extraction ----
    const [extraction] = await db
      .insert(aiExtractions)
      .values({
        tenantId,
        messageId,
        intent: result.intent,
        confidence: String(result.confidence),
        extractedJson: result as never,
        needsConfirmation: result.needs_confirmation,
        sourceType: (message.messageType === "audio" ? "audio" : message.messageType === "image" ? "image" : "text") as "text" | "audio" | "image",
        llmModel: ANTHROPIC_MODELS.sonnet,
        llmPrompt: { system: promptUsed } as never,
        llmRawResponse: raw as never,
      })
      .returning();

    // ---- Decide auto-execute ou pendente ----
    const decision = decideAutoExecute({
      extraction: result,
      settings: ctx.settings,
      sourceType: extraction.sourceType as "text" | "audio" | "image",
      isNewCustomer:
        !senderContact ||
        !senderContact.lastPurchaseAt, // primeiro relacionamento financeiro
    });

    let reply = result.reply_to_user;
    let processingStatus: PipelineOutput["status"];

    // Queries não criam nada, mas respondem com dado real:
    if (result.intent.startsWith("query_")) {
      reply = await answerQuery(tenantId, result.intent);
      await db
        .update(aiExtractions)
        .set({ status: "executed", updatedAt: new Date() })
        .where(eq(aiExtractions.id, extraction.id));
      processingStatus = "responded";
    } else if (decision.autoExecute) {
      const out = await execute(result, { tenantId, extractionId: extraction.id, contactIdHint: senderContact?.id ?? null });
      await db
        .update(aiExtractions)
        .set({ status: out.ok ? "executed" : "error", updatedAt: new Date() })
        .where(eq(aiExtractions.id, extraction.id));
      processingStatus = out.ok ? "launched" : "error";
    } else {
      await db
        .update(aiExtractions)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(aiExtractions.id, extraction.id));
      processingStatus = "pending_confirmation";
      // reforça que vai ficar pendente, sem inventar promessa.
      reply = reply || "Recebi sua mensagem. Vou deixar pra você confirmar antes de lançar.";
    }

    await db
      .update(whatsappMessages)
      .set({ processingStatus, aiResponse: reply, updatedAt: new Date() })
      .where(eq(whatsappMessages.id, messageId));

    logger.info(
      { tenantId, messageId, intent: result.intent, confidence: result.confidence, decision: decision.reason, processingStatus },
      "[ai] processed",
    );
    return { reply, status: processingStatus, extractionId: extraction.id };
  } catch (err) {
    const msg = (err as Error).message;
    logger.error({ tenantId, messageId, err: msg }, "[ai] pipeline error");
    await db
      .update(whatsappMessages)
      .set({ processingStatus: "error", updatedAt: new Date() })
      .where(eq(whatsappMessages.id, messageId));
    return { reply: "Tive um problema pra interpretar. Pode tentar de novo?", status: "error" };
  }
}

async function findContactByPhone(tenantId: string, phone: string): Promise<Contact | null> {
  const normalized = phone.startsWith("+") ? phone : `+${phone.replace(/\D/g, "")}`;
  const [c] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.phone, normalized)))
    .limit(1);
  return c ?? null;
}

async function resolveText(input: {
  message: WhatsAppMessage;
  inboundTextOverride?: string;
}): Promise<{ text: string | null; transcription?: string | null }> {
  if (input.inboundTextOverride) return { text: input.inboundTextOverride };
  const m = input.message;
  if (m.messageType === "text") return { text: m.rawContent ?? null };
  if (m.transcription) return { text: m.transcription, transcription: m.transcription };

  if (m.messageType === "audio") {
    if (!m.mediaUrl) return { text: null };
    const buf = await readBuffer(m.mediaUrl);
    const { text } = await transcribeAudio(buf, { mime: "audio/ogg" });
    return { text, transcription: text };
  }

  if (m.messageType === "image") {
    if (!m.mediaUrl) return { text: null };
    const buf = await readBuffer(m.mediaUrl);
    const receipt = await extractReceipt({ imageBuffer: buf, mime: "image/jpeg" });
    // Converte a leitura do cupom em uma descrição que o extractor entende.
    const lines = [
      `Cupom fiscal recebido por foto.`,
      receipt.supplier_name ? `Fornecedor: ${receipt.supplier_name}` : null,
      receipt.cnpj ? `CNPJ: ${receipt.cnpj}` : null,
      receipt.date_iso ? `Data: ${receipt.date_iso}` : null,
      receipt.total_cents ? `Total: ${(receipt.total_cents / 100).toFixed(2)} reais` : null,
      receipt.payment_method ? `Pagamento: ${receipt.payment_method}` : null,
      receipt.suggested_category ? `Categoria sugerida: ${receipt.suggested_category}` : null,
      receipt.items.length
        ? `Itens: ${receipt.items.map((i) => i.description).join(", ")}`
        : null,
      receipt.confidence < 0.5 ? "Imagem com qualidade BAIXA — peça confirmação." : null,
    ]
      .filter(Boolean)
      .join("\n");
    return { text: lines || "Recebi uma foto mas não consegui ler o cupom." };
  }

  return { text: null };
}

/** Respostas das queries — números reais do banco. */
async function answerQuery(tenantId: string, intent: string): Promise<string> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  if (intent === "query_revenue_today") {
    const [agg] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${sales.totalAmountCents}), 0)`,
        paid: sql<number>`COALESCE(SUM(${sales.paidAmountCents}), 0)`,
        pending: sql<number>`COALESCE(SUM(${sales.pendingAmountCents}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.tenantId, tenantId),
          gte(sales.saleDate, startOfToday),
          sql`${sales.paymentStatus} <> 'cancelled'`,
        ),
      );
    const total = Number(agg.total ?? 0) / 100;
    const paid = Number(agg.paid ?? 0) / 100;
    const pending = Number(agg.pending ?? 0) / 100;
    return `Hoje você vendeu R$ ${total.toFixed(2)} em ${agg.count} venda(s). Recebido: R$ ${paid.toFixed(2)}. A receber: R$ ${pending.toFixed(2)}.`;
  }

  if (intent === "query_overdue") {
    const rows = await db
      .select({
        name: contacts.name,
        phone: contacts.phone,
        amount: receivables.amountPendingCents,
        due: receivables.dueDate,
      })
      .from(receivables)
      .leftJoin(contacts, eq(contacts.id, receivables.contactId))
      .where(
        and(
          eq(receivables.tenantId, tenantId),
          sql`${receivables.status} IN ('open','partial','overdue')`,
        ),
      )
      .orderBy(receivables.dueDate)
      .limit(20);
    if (!rows.length) return "Ninguém te deve nada agora 🙌";
    const lines = rows.map((r) => {
      const who = r.name || r.phone;
      const valor = (Number(r.amount ?? 0) / 100).toFixed(2);
      const dueLabel = r.due ? new Date(r.due).toLocaleDateString("pt-BR") : "sem prazo";
      return `${who}: R$ ${valor} (${dueLabel})`;
    });
    return `Pendentes:\n${lines.join("\n")}`;
  }

  if (intent === "query_expenses_today") {
    const [agg] = await db
      .select({ total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)`, count: sql<number>`COUNT(*)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.tenantId, tenantId),
          gte(expenses.expenseDate, startOfToday),
          eq(expenses.status, "paid"),
        ),
      );
    const total = Number(agg.total ?? 0) / 100;
    return `Hoje você gastou R$ ${total.toFixed(2)} em ${agg.count} despesa(s).`;
  }

  if (intent === "query_summary") {
    const [sale] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${sales.totalAmountCents}), 0)`,
        paid: sql<number>`COALESCE(SUM(${sales.paidAmountCents}), 0)`,
        pending: sql<number>`COALESCE(SUM(${sales.pendingAmountCents}), 0)`,
      })
      .from(sales)
      .where(and(eq(sales.tenantId, tenantId), gte(sales.saleDate, startOfToday)));
    const [exp] = await db
      .select({ total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.tenantId, tenantId),
          gte(expenses.expenseDate, startOfToday),
          eq(expenses.status, "paid"),
        ),
      );
    const lines = [
      `Resumo de hoje:`,
      `Vendas: R$ ${(Number(sale.total ?? 0) / 100).toFixed(2)}`,
      `Recebido: R$ ${(Number(sale.paid ?? 0) / 100).toFixed(2)}`,
      `A receber: R$ ${(Number(sale.pending ?? 0) / 100).toFixed(2)}`,
      `Despesas: R$ ${(Number(exp.total ?? 0) / 100).toFixed(2)}`,
    ];
    return lines.join("\n");
  }
  return "Não consegui montar a resposta agora.";
}

// imports usados só para typings dos selects acima
void payments;
