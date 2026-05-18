/**
 * Aplica migrations Drizzle em produção sem precisar de drizzle-kit/tsx.
 * Idempotente via tabela __migrations.
 *
 * Opcional: se RESET_DB_ON_BOOT=true, dropa o schema public ANTES de aplicar.
 * Use exatamente uma vez ao fazer um reset de produto e depois remova a env.
 */
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is required");
    process.exit(1);
  }

  const reset = String(process.env.RESET_DB_ON_BOOT ?? "").toLowerCase() === "true";
  const pool = new Pool({ connectionString: url, max: 1 });

  try {
    if (reset) {
      console.warn("[migrate] RESET_DB_ON_BOOT=true → DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      await pool.query("DROP SCHEMA IF EXISTS public CASCADE;");
      await pool.query("CREATE SCHEMA public;");
      await pool.query("GRANT ALL ON SCHEMA public TO PUBLIC;");
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS __migrations (
        hash text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    const dir = path.join(__dirname, "..", "drizzle", "migrations");
    if (!fs.existsSync(dir)) {
      console.log("[migrate] no drizzle/migrations folder, nothing to do");
      return;
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      const { rowCount } = await pool.query("SELECT 1 FROM __migrations WHERE hash = $1", [file]);
      if (rowCount && rowCount > 0) {
        console.log(`[migrate] skip ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, file), "utf-8");
      const statements = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);
      console.log(`[migrate] apply ${file} (${statements.length} statements)`);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const stmt of statements) {
          await client.query(stmt);
        }
        await client.query("INSERT INTO __migrations (hash) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    console.log("[migrate] done");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
