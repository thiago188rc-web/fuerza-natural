import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { gyms, gymSettings, plans, appUsers } from "@/data/schema";
import { sql } from "drizzle-orm";

if (existsSync(resolve(process.cwd(), ".env.local"))) {
  loadEnv({ path: resolve(process.cwd(), ".env.local"), override: false, quiet: true });
}

/**
 * Seed de DESARROLLO LOCAL únicamente — datos claramente ficticios, nunca
 * los 207 alumnos / 778 pagos reales del Data Discovery. Esos entran por
 * la futura fase de migración, no por acá (brief Fase 0 §15).
 *
 * Usa DATABASE_URL_OWNER porque necesita `set_config` fuera de las
 * restricciones normales de fn_app para el bootstrap del primer gimnasio
 * (mismo problema de arranque que get_app_user_by_auth_id) — en un seed
 * de un solo uso esto es aceptable; los casos de uso reales de la app
 * nunca hacen esto.
 */
async function main() {
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) {
    console.error("Falta DATABASE_URL_OWNER — no se puede seedear sin una conexión con privilegios.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const gymId = randomUUID();
  const planIds = {
    dos: randomUUID(),
    tres: randomUUID(),
    cuatro: randomUUID(),
    cinco: randomUUID(),
  };

  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.gym_id', ${gymId}, true)`);

    await tx.insert(gyms).values({
      id: gymId,
      nombre: "Fuerza Natural (DEMO — no es el gimnasio real)",
      timezone: "America/Argentina/Buenos_Aires",
      moneda: "ARS",
    });

    await tx.insert(gymSettings).values({ gymId });

    // Precios placeholder a propósito — NO son los precios reales
    // detectados en el Data Discovery. El dueño los confirma en
    // Configuración (SPEC V1 §17, decisión #2).
    await tx.insert(plans).values([
      { id: planIds.dos, gymId, nombre: "2 días", diasSemana: 2, precioActual: "0", orden: 1 },
      { id: planIds.tres, gymId, nombre: "3 días", diasSemana: 3, precioActual: "0", orden: 2 },
      { id: planIds.cuatro, gymId, nombre: "4 días", diasSemana: 4, precioActual: "0", orden: 3 },
      { id: planIds.cinco, gymId, nombre: "5 días", diasSemana: 5, precioActual: "0", orden: 4 },
    ]);

    console.log("✓ Gimnasio DEMO creado (datos ficticios, precios en 0).");
    console.log(`  gym_id = ${gymId}`);
    console.log("  Login de desarrollo: cualquier email/contraseña en /login,");
    console.log("  válido SOLO sin NEXT_PUBLIC_SUPABASE_* y fuera de producción.");
  });

  // Fila en app_users con el auth_user_id fijo que usa la sesión simulada
  // de desarrollo (src/lib/auth/config.ts). Con esto, y SOLO fuera de
  // producción y sin Supabase configurado, el login de /login entra como
  // este usuario — es lo que permite recorrer la app y correr los tests
  // e2e sin un proyecto Supabase real. Con Supabase real configurado, esta
  // fila no sirve para entrar: ahí hace falta un usuario de verdad en
  // Supabase Auth (ver docs/RUNBOOK.md "Bootstrap en Supabase").
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.gym_id', ${gymId}, true)`);
    await tx.insert(appUsers).values({
      gymId,
      authUserId: "00000000-0000-0000-0000-000000000001",
      email: "demo@fuerzanatural.test",
      nombre: "Usuario Demo (Fuerza Natural)",
      rol: "DUENO",
    });
  });

  console.log("✓ Seed de desarrollo completo.");
  await client.end({ timeout: 5 });
}

main().catch((err) => {
  console.error("✗ Seed falló:", err);
  process.exit(1);
});
