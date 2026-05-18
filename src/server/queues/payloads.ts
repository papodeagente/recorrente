/**
 * Tipos de payload por fila.
 *
 * Centraliza shapes para que producer (rotas Next, scheduler) e consumer
 * (workers) compartilhem o contrato e o TS reclame de incompatibilidade.
 */

export type InboundJob = {
  tenantId: string;
  instanceId: string;
  receivedAt: string; // ISO
  // payload bruto da Z-API; tipado como `unknown` porque varia por evento.
  payload: Record<string, unknown>;
};

export type DispatcherJob = {
  tenantId: string;
  scheduledActionId: string;
};

export type AgentReasonJob = {
  tenantId: string;
  scheduledActionId?: string;
  conversationId?: string;
  customerId: string;
  intent: "recurrence_nudge" | "free_reply";
};

export type OutboundJob = {
  tenantId: string;
  customerId: string;
  conversationId?: string;
  /** Texto JÁ pronto. Rodapé LGPD é decidido no outbound worker. */
  text: string;
  relatedActionId?: string;
};
