import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// Carga .env.local si existe (no lo pisa si ya hay algo seteado por el shell/CI).
if (existsSync(resolve(process.cwd(), ".env.local"))) {
  loadEnv({ path: resolve(process.cwd(), ".env.local"), override: false, quiet: true });
}

/**
 * Aplica, en orden, las tres capas de la base de datos (SPEC V1 §3, §4):
 *
 *   1. db/migrations/infra/00_*.sql   — extensiones + roles (a mano)
 *   2. db/migrations/*.sql            — esquema de las 10 tablas (drizzle-kit)
 *   3. db/migrations/infra/01_*.sql   — RLS + policies + triggers (a mano)
 *
 * SIEMPRE con DATABASE_URL_OWNER (rol fn_owner). Nunca con DATABASE_URL
 * (fn_app) — fn_app no tiene privilegios de DDL a propósito.
 *
 * Los archivos infra/*.sql están escritos con `IF NOT EXISTS` / `CREATE OR
 * REPLACE` donde corresponde, así que correr este script dos veces sobre
 * la misma base es seguro para las capas 1 y 3. La capa 2 (drizzle-kit) ya
 * es idempotente por diseño (lleva su propio journal de migraciones
 * aplicadas en `drizzle_migrations`).
 */
async function main() {
  const ownerUrl = process.env.DATABASE_URL_OWNER;
  if (!ownerUrl) {
    console.error(
      "Falta DATABASE_URL_OWNER. Sin esta variable no se puede migrar — " +
        "es intencional: la app en runtime (DATABASE_URL / fn_app) nunca " +
        "tiene privilegios de DDL. Ver .env.example.",
    );
    process.exit(1);
  }

  const sql = postgres(ownerUrl, { max: 1 });
  const db = drizzle(sql);

  try {
    console.log("→ Capa 1/3: extensiones y roles (db/migrations/infra/00_*.sql)");
    await runInfraSql(sql, "00");

    console.log("→ Capa 2/3: esquema de las 10 tablas (drizzle-kit)");
    await migrate(db, { migrationsFolder: resolve(process.cwd(), "db/migrations") });

    console.log("→ Capa 3/3: RLS, policies y triggers (db/migrations/infra/01_*.sql)");
    await runInfraSql(sql, "01");

    console.log("✓ Migración completa.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function runInfraSql(sql: postgres.Sql, prefix: string) {
  const dir = resolve(process.cwd(), "db/migrations/infra");
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    console.log(`  · ${file}`);
    const text = readFileSync(resolve(dir, file), "utf8");
    await sql.unsafe(text);
  }
}

main().catch((err) => {
  console.error("✗ Migración falló:", err);
  process.exit(1);
});
