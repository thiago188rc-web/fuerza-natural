import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { gyms, gymSettings, plans, appUsers } from "@/data/schema";
import { eq, sql } from "drizzle-orm";

if (existsSync(resolve(process.cwd(), ".env.local"))) {
  loadEnv({ path: resolve(process.cwd(), ".env.local"), override: false, quiet: true });
}

/**
 * Seed de DESARROLLO LOCAL únicamente — gimnasio ficticio, nunca los 207
 * alumnos / 778 pagos reales del Data Discovery. Esos entran por la futura
 * fase de migración, no por acá (brief Fase 0 §15).
 *
 * RE-EJECUTABLE. La primera versión fallaba la segunda vez
 * (`app_users_auth_user_id_key` duplicada) y dejaba la base a medias: un
 * gimnasio nuevo sin usuario, y el usuario demo apuntando al gimnasio
 * viejo con la configuración vieja. Como este script es justamente lo que
 * hay que volver a correr cada vez que cambian los planes o los precios,
 * ahora reutiliza el gimnasio del usuario demo si ya existe y actualiza su
 * configuración en lugar de duplicarla.
 *
 * Usa DATABASE_URL_OWNER porque necesita `set_config` fuera de las
 * restricciones normales de fn_app para el bootstrap del primer gimnasio
 * (mismo problema de arranque que get_app_user_by_auth_id). Los casos de
 * uso reales de la app nunca hacen esto.
 */

/** El auth_user_id fijo que usa la sesión simulada de desarrollo. */
const AUTH_USER_ID_DEMO = "00000000-0000-0000-0000-000000000001";

async function main() {
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) {
    console.error("Falta DATABASE_URL_OWNER — no se puede seedear sin una conexión con privilegios.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  // ¿Ya existe el gimnasio DEMO? `app_users` no tiene FORCE ROW LEVEL
  // SECURITY (ver docs/SECURITY.md §3.2), así que fn_owner puede leerlo
  // sin contexto de tenant — que es justo lo que hace falta acá, porque
  // todavía no sabemos qué gym_id setear.
  const [demoExistente] = await db
    .select({ gymId: appUsers.gymId })
    .from(appUsers)
    .where(eq(appUsers.authUserId, AUTH_USER_ID_DEMO));

  const gymId = demoExistente?.gymId ?? randomUUID();
  const esNuevo = !demoExistente;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.gym_id', ${gymId}, true)`);

    if (esNuevo) {
      await tx.insert(gyms).values({
        id: gymId,
        nombre: "Fuerza Natural (DEMO — no es el gimnasio real)",
        timezone: "America/Argentina/Buenos_Aires",
        moneda: "ARS",
      });
    }

    // $45.000 confirmado por el dueño para la modalidad "1/2 MES". Vive en
    // la configuración del gimnasio, no como constante del código, y NO
    // como un plan: `students.plan_id` referencia `plans`, así que un
    // "1/2 MES" ahí dentro podría asignarse como plan habitual de alguien
    // — exactamente lo que la regla confirmada prohíbe.
    await tx
      .insert(gymSettings)
      .values({ gymId, precioMedioMes: "45000" })
      .onConflictDoUpdate({
        target: gymSettings.gymId,
        set: { precioMedioMes: "45000", updatedAt: new Date() },
      });

    // Los cinco planes y los precios que el dueño confirmó
    // (docs/REGLAS-DE-NEGOCIO.md §1 y §2). Son DATOS del gimnasio, no
    // constantes del código: se editan desde Configuración, y cambiarlos
    // no toca ningún pago ya registrado — cada pago conserva su snapshot.
    //
    // LIBRE va con `precioActual: null` a propósito: el dueño todavía NO
    // confirmó su precio, y un 0 diría que el plan es gratis. `acceso:
    // "LIBRE"` significa "5 días o más por semana, incluye sábados", con
    // `diasSemana` leído como piso — por eso no es lo mismo que "5 días",
    // aunque históricamente hayan costado igual.
    const catalogo = [
      { nombre: "2 días", diasSemana: 2, acceso: "DIAS_FIJOS", precioActual: "50000", orden: 1 },
      { nombre: "3 días", diasSemana: 3, acceso: "DIAS_FIJOS", precioActual: "55000", orden: 2 },
      { nombre: "4 días", diasSemana: 4, acceso: "DIAS_FIJOS", precioActual: "60000", orden: 3 },
      { nombre: "5 días", diasSemana: 5, acceso: "DIAS_FIJOS", precioActual: "65000", orden: 4 },
      { nombre: "LIBRE", diasSemana: 5, acceso: "LIBRE", precioActual: null, orden: 5 },
    ] as const;

    for (const plan of catalogo) {
      await tx
        .insert(plans)
        .values({ id: randomUUID(), gymId, ...plan })
        .onConflictDoUpdate({
          target: [plans.gymId, plans.nombre],
          set: {
            diasSemana: plan.diasSemana,
            acceso: plan.acceso,
            precioActual: plan.precioActual,
            orden: plan.orden,
            activo: true,
            updatedAt: new Date(),
          },
        });
    }

    // Fila en app_users con el auth_user_id fijo que usa la sesión
    // simulada de desarrollo (src/lib/auth/config.ts). Con esto, y SOLO
    // fuera de producción y sin Supabase configurado, el login de /login
    // entra como este usuario — es lo que permite recorrer la app y correr
    // los tests e2e sin un proyecto Supabase real. Con Supabase real
    // configurado, esta fila no sirve para entrar: ahí hace falta un
    // usuario de verdad en Supabase Auth (docs/RUNBOOK.md).
    if (esNuevo) {
      await tx.insert(appUsers).values({
        gymId,
        authUserId: AUTH_USER_ID_DEMO,
        email: "demo@fuerzanatural.test",
        nombre: "Usuario Demo (Fuerza Natural)",
        rol: "DUENO",
      });
    }
  });

  console.log(
    esNuevo
      ? "✓ Gimnasio DEMO creado (gimnasio ficticio; precios reales confirmados)."
      : "✓ Gimnasio DEMO ya existía: planes y precios actualizados.",
  );
  console.log(`  gym_id = ${gymId}`);
  console.log("  LIBRE queda SIN precio: el dueño todavía no lo confirmó.");
  console.log("  Login de desarrollo: cualquier email/contraseña en /login,");
  console.log("  válido SOLO sin NEXT_PUBLIC_SUPABASE_* y fuera de producción.");

  await client.end({ timeout: 5 });
}

main().catch((err) => {
  console.error("✗ Seed falló:", err);
  process.exit(1);
});
