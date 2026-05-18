/**
 * LGPD — opt-out detection + footer obrigatório.
 *
 * Seção 10 do prompt fundacional.
 *
 * Convenções:
 * - Toda primeira mensagem outbound do agente para um cliente novo termina com
 *   o footer de opt-out (seção 10).
 * - Inbound contendo qualquer keyword de opt-out marca customer.lgpd_opted_out_at
 *   imediatamente e dispara mensagem de confirmação única.
 */

const STOP_WORDS = ["sair", "parar", "remover", "cancelar", "stop", "pare", "remova"];

/** Remove acentos para comparar opt-out. */
function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Detecta intenção de opt-out na inbound do cliente.
 * True somente quando a mensagem É exclusivamente uma keyword (com ou sem
 * pontuação leve), evita falso positivo em conversas do tipo "vou sair daqui".
 */
export function isOptOutMessage(content: string): boolean {
  const normalized = normalize(content).replace(/[!?.]/g, "").trim();
  if (!normalized) return false;
  if (STOP_WORDS.includes(normalized)) return true;
  // tolerante a "sair!", "QUERO SAIR", "por favor remova"
  const words = normalized.split(/\s+/);
  if (words.length <= 4 && words.some((w) => STOP_WORDS.includes(w))) return true;
  return false;
}

export function lgpdOptOutFooter(): string {
  return "_Se preferir não receber, responda SAIR._";
}

export function lgpdOptOutConfirmation(): string {
  return "Pronto, você não receberá mais mensagens. Pra voltar é só responder VOLTAR.";
}

export function isOptInMessage(content: string): boolean {
  const normalized = normalize(content).replace(/[!?.]/g, "").trim();
  return normalized === "voltar" || normalized === "retornar";
}
