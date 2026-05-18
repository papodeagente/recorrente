/**
 * intent-classifier — chama Claude Haiku para classificar uma mensagem
 * em UMA palavra de um conjunto fechado.
 *
 * Uso: detectar resposta positiva/negativa, reclamação, opt-out implícito,
 * pedido pra falar com humano, fora de escopo.
 *
 * Princípio: nunca confiar 100% no LLM aqui. O caller sempre tem
 * fallback determinístico (defaultTo) quando a resposta não bate com
 * nenhuma das opções.
 */

import { ANTHROPIC_MODELS, anthropic } from "@/server/lib/anthropic";
import { logger } from "@/server/lib/logger";

export type ClassifierOpts<T extends string> = {
  /** Mensagem de entrada (geralmente do cliente). */
  message: string;
  /** Categorias possíveis. Haiku deve retornar exatamente uma delas. */
  categories: readonly T[];
  /** Descrição curta de cada categoria, em pt-BR. */
  description: string;
  /** Categoria a usar quando o LLM falhar ou devolver coisa fora da lista. */
  defaultTo: T;
};

export async function classifyIntent<T extends string>(
  opts: ClassifierOpts<T>,
): Promise<{ category: T; raw: string; fallback: boolean }> {
  const list = opts.categories.map((c) => `- ${c}`).join("\n");
  const system = `Você é um classificador binário em português brasileiro. ${opts.description}\n\nResponda APENAS com UMA das opções abaixo, sem aspas, sem pontuação, sem explicação:\n${list}`;

  try {
    const res = await anthropic().messages.create({
      model: ANTHROPIC_MODELS.haiku,
      max_tokens: 8,
      system,
      messages: [{ role: "user", content: opts.message.slice(0, 1000) }],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim()
      .toLowerCase()
      .replace(/[^a-z_]/g, "");
    const match = opts.categories.find((c) => c.toLowerCase() === text);
    if (match) return { category: match, raw: text, fallback: false };
    logger.warn({ raw: text, categories: opts.categories }, "[classifier] no match, falling back");
    return { category: opts.defaultTo, raw: text, fallback: true };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[classifier] LLM error, falling back");
    return { category: opts.defaultTo, raw: "", fallback: true };
  }
}
