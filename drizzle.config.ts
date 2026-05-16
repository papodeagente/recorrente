import "dotenv/config";
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://recorrente:recorrente@localhost:5432/recorrente_dev",
  },
  strict: true,
  verbose: true,
} satisfies Config;
