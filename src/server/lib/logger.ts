import pino from "pino";
import { env } from "@/lib/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { role: env.RUNTIME_ROLE },
  ...(env.NODE_ENV === "development" && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
    },
  }),
});
