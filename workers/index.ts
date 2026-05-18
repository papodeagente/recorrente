/**
 * Worker bootstrap (BOLSO).
 *
 * Apenas 2 filas têm processador real:
 *   - whatsapp:inbound  → pipeline IA (texto/áudio/imagem)
 *   - whatsapp:outbound → envia via Z-API (rate-limit 1 msg/4s)
 *
 * As outras 4 filas do registry (actions:scheduler, actions:dispatcher,
 * agent:reason, metrics:rollup) não têm produtores neste momento — entram
 * em pilares futuros (resumo diário, cobrança automática, etc.).
 */

import "dotenv/config";
import { Worker, type Job, type WorkerOptions } from "bullmq";
import { redis } from "@/server/queues/connection";
import { QUEUES, type QueueName } from "@/server/queues";
import { logger } from "@/server/lib/logger";
import { processInbound } from "./handlers/whatsapp-inbound";
import { processOutbound } from "./handlers/whatsapp-outbound";

const base: WorkerOptions = { connection: redis, concurrency: 4 };

type Entry = {
  name: QueueName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (job: Job<any>) => Promise<unknown>;
  options?: Partial<WorkerOptions>;
};

const handlers: Entry[] = [
  { name: QUEUES.whatsappInbound, handler: processInbound, options: { concurrency: 2 } },
  {
    name: QUEUES.whatsappOutbound,
    handler: processOutbound,
    options: { concurrency: 1, limiter: { max: 1, duration: 4_000 } },
  },
];

function start({ name, handler, options }: Entry): Worker {
  const w = new Worker(name, handler, { ...base, ...options });
  w.on("ready", () => logger.info({ queue: name }, "[worker] ready"));
  w.on("active", (job) => logger.debug({ queue: name, jobId: job.id }, "[worker] active"));
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
