/**
 * Worker bootstrap — roda em processo separado do Next.js.
 *
 * Mapeia cada fila ao handler real (Pilar 1). Filas sem lógica implementada
 * ainda usam stub que apenas loga (Pilar 2/3/4).
 */

import "dotenv/config";
import { Worker, type WorkerOptions, type Job } from "bullmq";
import { redis } from "@/server/queues/connection";
import { QUEUES, type QueueName } from "@/server/queues";
import { logger } from "@/server/lib/logger";
import { processInbound } from "./handlers/whatsapp-inbound";
import { processDispatch } from "./handlers/actions-dispatcher";
import { processAgentReason } from "./handlers/agent-reason";
import { processOutbound } from "./handlers/whatsapp-outbound";

const baseOptions: WorkerOptions = { connection: redis, concurrency: 5 };

type HandlerEntry = {
  name: QueueName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (job: Job<any>) => Promise<unknown>;
  options?: Partial<WorkerOptions>;
};

const handlers: HandlerEntry[] = [
  { name: QUEUES.whatsappInbound, handler: processInbound },
  { name: QUEUES.actionsDispatcher, handler: processDispatch },
  { name: QUEUES.agentReason, handler: processAgentReason, options: { concurrency: 2 } },
  {
    name: QUEUES.whatsappOutbound,
    handler: processOutbound,
    // Rate limit §9: 1 mensagem a cada 4s POR ESTA INSTÂNCIA DO WORKER.
    // Vários workers escalando exigem limiter Redis por tenant — futuro.
    options: { concurrency: 1, limiter: { max: 1, duration: 4_000 } },
  },
  {
    name: QUEUES.actionsScheduler,
    handler: async (job) => {
      logger.info({ jobId: job.id, data: job.data }, "[stub:actions:scheduler]");
      return { stub: true };
    },
  },
  {
    name: QUEUES.metricsRollup,
    handler: async (job) => {
      logger.info({ jobId: job.id, data: job.data }, "[stub:metrics:rollup]");
      return { stub: true };
    },
  },
];

function start({ name, handler, options }: HandlerEntry): Worker {
  const w = new Worker(name, handler, { ...baseOptions, ...options });
  w.on("ready", () => logger.info({ queue: name }, "[worker] ready"));
  w.on("active", (job) => logger.info({ queue: name, jobId: job.id }, "[worker] active"));
  w.on("completed", (job, result) =>
    logger.info({ queue: name, jobId: job.id, result }, "[worker] completed"),
  );
  w.on("failed", (job, err) =>
    logger.error({ queue: name, jobId: job?.id, err: err.message }, "[worker] failed"),
  );
  w.on("error", (err) => logger.error({ queue: name, err: err.message }, "[worker] error"));
  return w;
}

async function main(): Promise<void> {
  logger.info({ queues: handlers.map((h) => h.name) }, "[worker] starting");
  const workers = handlers.map(start);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "[worker] shutting down");
    await Promise.all(workers.map((w) => w.close()));
    await redis.quit();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main();
