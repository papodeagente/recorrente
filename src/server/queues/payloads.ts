/**
 * Tipos de payload por fila.
 *
 * Para BOLSO usamos apenas 2 filas reais (inbound, outbound). As outras 4 do
 * registry ficam ociosas — nenhum produtor as alimenta.
 */

export type InboundJob = {
  tenantId: string;
  messageId: string;
};

export type OutboundJob = {
  tenantId: string;
  text: string;
  /** ID da inbound a que esta outbound responde (usado pra resolver telefone). */
  replyToMessageId?: string;
  /** Quando a outbound é "stand-alone" (ex.: lembrete cron), forneça phone direto. */
  phone?: string;
};
