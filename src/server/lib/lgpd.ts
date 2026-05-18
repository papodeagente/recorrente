/**
 * LGPD — detecção de opt-out + footer.
 */

const STOP_WORDS = ["sair", "parar", "remover", "cancelar", "stop", "pare", "remova"];

function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function isOptOutMessage(content: string): boolean {
  const n = normalize(content).replace(/[!?.]/g, "").trim();
  if (!n) return false;
  if (STOP_WORDS.includes(n)) return true;
  const words = n.split(/\s+/);
  if (words.length <= 4 && words.some((w) => STOP_WORDS.includes(w))) return true;
  return false;
}

export function isOptInMessage(content: string): boolean {
  const n = normalize(content).replace(/[!?.]/g, "").trim();
  return n === "voltar" || n === "retornar";
}

export function lgpdOptOutFooter(): string {
  return "_Se preferir não receber, responda SAIR._";
}

export function lgpdOptOutConfirmation(): string {
  return "Pronto, você não receberá mais mensagens. Pra voltar é só responder VOLTAR.";
}
