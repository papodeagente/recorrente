/**
 * Zera o schema `public` do Postgros + apaga __migrations.
 *
 * Use UMA VEZ depois de um reset de produto (mudança grande de schema).
 * O migrate-prod.cjs roda em seguida e aplica tudo do zero.
 *
 * Como rodar:
 *   - No Coolify, terminal do container web (Application > Terminal):
 *       node scripts/reset-db.cjs
 *     E em seguida o boot do container já roda migrate-prod automaticamente.
 *   - Local:
 *       DATABASE_URL=... node scripts/reset-db.cjs && npm run db:migrate
 *
 * Idempotente: se o schema já estiver vazio, não faz mal.
 */
const { Pool } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[reset-db] DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    console.log("[reset-db] DROP SCHEMA public CASCADE ...");
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE;");
    console.log("[reset-db] CREATE SCHEMA public ...");
    await pool.query("CREATE SCHEMA public;");
    await pool.query("GRANT ALL ON SCHEMA public TO PUBLIC;");
    console.log("[reset-db] done. Now run migrate-prod (or restart the container).");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[reset-db] failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
