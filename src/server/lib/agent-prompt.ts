/**
 * agent-prompt — monta system + user prompt para Claude Sonnet,
 * respeitando o contrato de tom da §7.2 do prompt fundacional.
 *
 * Regras (NUNCA quebrar):
 * - 2-4 linhas no máximo
 * - 1 emoji no máximo, e só se combinar com o tom
 * - Não dizer "sou IA", "sou robô", "sou assistente virtual"
 * - Não prometer descontos/brindes não configurados
 * - Sempre se referir ao negócio pelo `business_name`
 * - pt-BR coloquial, sem gírias regionais excessivas
 * - Respeitar `agent_tone`
 */

import type { Customer, Service, TenantSettings, Tenant } from "@/server/db/schema";

export type AgentTone = "amigavel" | "profissional" | "descolado";

function toneDescription(tone: AgentTone): string {
  switch (tone) {
    case "profissional":
      return "Tom profissional e cordial. Sem gírias. Sem emojis.";
    case "descolado":
      return "Tom descolado e leve. Pode usar 1 emoji se combinar.";
    case "amigavel":
    default:
      return "Tom amigável e próximo, como quem conhece o cliente. No máximo 1 emoji.";
  }
}

export function buildAgentSystemPrompt(input: {
  tenant: Pick<Tenant, "businessName" | "businessType">;
  settings: Pick<TenantSettings, "agentPersonaName" | "agentTone">;
}): string {
  const tone = (input.settings.agentTone as AgentTone) ?? "amigavel";
  return [
    `Você é ${input.settings.agentPersonaName}, do(a) "${input.tenant.businessName}" (${input.tenant.businessType}).`,
    `${toneDescription(tone)}`,
    `Restrições absolutas:`,
    `- Responda em português brasileiro coloquial.`,
    `- Entre 2 e 4 linhas curtas. Cada linha curta.`,
    `- NUNCA diga que é uma IA, robô, assistente virtual ou software.`,
    `- NUNCA prometa preços, descontos, brindes ou condições que não foram explicitamente passados no contexto.`,
    `- Não invente horários, disponibilidade ou serviços que não foram informados.`,
    `- Não use gírias regionais fortes.`,
    `- Não use mais de 1 emoji por mensagem.`,
  ].join("\n");
}

export function buildRecurrenceNudgePrompt(input: {
  customer: Pick<Customer, "name" | "lastVisitAt">;
  service: Pick<Service, "name" | "recurrenceDays">;
}): string {
  const nome = input.customer.name?.trim() || "(o cliente)";
  const ultima =
    input.customer.lastVisitAt instanceof Date
      ? `há ${Math.round(
          (Date.now() - input.customer.lastVisitAt.getTime()) / (1000 * 60 * 60 * 24),
        )} dias`
      : "faz um tempo";
  return [
    `Contexto: o cliente "${nome}" fez "${input.service.name}" pela última vez ${ultima}.`,
    `Tarefa: escreva uma mensagem curta lembrando que costuma ser hora de marcar o próximo "${input.service.name}" (cadência natural ${input.service.recurrenceDays} dias).`,
    `Pergunte de forma leve qual o melhor horário pra ele(a) nesta semana ou na próxima. NÃO sugira data e hora específicas (não temos agenda).`,
    `Não diga "estamos com horários disponíveis" — apenas convide a marcar.`,
  ].join("\n");
}
