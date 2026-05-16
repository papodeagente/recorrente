import IORedis, { type Redis } from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

/**
 * Conexão Redis compartilhada (BullMQ + Socket.IO adapter).
 * BullMQ exige `maxRetriesPerRequest = null` no producer e nos workers.
 */
export const redis: Redis =
  globalForRedis.redis ??
  new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

if (env.NODE_ENV !== "production") globalForRedis.redis = redis;
