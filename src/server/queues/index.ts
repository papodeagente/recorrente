/**
 * BullMQ — definição das filas estruturais (seção 8 do prompt).
 *
 * NESTA FASE FUNDACIONAL: filas existem, podem aceitar jobs, mas a lógica de
 * processamento nos workers é apenas um stub que loga e marca como concluído.
 * Cada worker virá em prompt subsequente conforme cada pilar for implementado.
 */

import { Queue, QueueEvents, type JobsOptions } from "bullmq";
import { redis } from "./connection";

export const QUEUES = {
  whatsappInbound: "whatsapp:inbound",
  whatsappOutbound: "whatsapp:outbound",
  actionsScheduler: "actions:scheduler",
  actionsDispatcher: "actions:dispatcher",
  agentReason: "agent:reason",
  metricsRollup: "metrics:rollup",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2_000 },
  removeOnComplete: { age: 24 * 3600, count: 5_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

const cache = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let q = cache.get(name);
  if (!q) {
    q = new Queue(name, { connection: redis, defaultJobOptions });
    cache.set(name, q);
  }
  return q;
}

export const queueEvents = (name: QueueName) =>
  new QueueEvents(name, { connection: redis.duplicate() });
