/**
 * Worker bootstrap — roda em processo separado do Next.js.
 *
 * Em produção: container próprio no Coolify executando `node workers/index.js`
 * (ou via tsx em dev). Compartilha o mesmo Redis e Postgres do app.
 */

import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redis } from "@/server/queues/connection";
import { QUEUES, type QueueName } from "@/server/queues";
import { logger } from "@/server/lib/logger";

async function stubProcessor(name: QueueName, job: Job): Promise<{ noop: true }> {
  logger.info({ queue: name, jobId: job.id, data: job.data }, "[worker:stub] received job");
  // Lógica de cada fila será adicionada nos prompts subsequentes.
  return { noop: true };
}

function startWorker(name: QueueName) {
  const w = new Worker(name, async (job) => stubProcessor(name, job), {
    connection: redis,
    concurrency: 5,
  });
  w.on("ready", () => logger.info({ queue: name }, "[worker] ready"));
  w.on("failed", (job, err) =>
    logger.error({ queue: name, jobId: job?.id, err: err.message }, "[worker] job failed"),
  );
  w.on("error", (err) => logger.error({ queue: name, err: err.message }, "[worker] error"));
  return w;
}

async function main() {
  logger.info("[worker] starting all workers");
  const workers = (Object.values(QUEUES) as QueueName[]).map(startWorker);

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
