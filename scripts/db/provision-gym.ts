import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { appUsers, gymSettings, gyms, plans } from "@/data/schema";
import {
  CATALOGO_PLANES_INICIAL,
  PRECIO_MEDIO_MES_INICIAL,
  leerArgumentos,
  listarGimnasios,
} from "./_compartido";

if (existsSync(resolve(process.cwd(), ".env.local"))) {
  loadEnv({ path: resolve(process.cwd(), ".env.local"), override: false, quiet: true });
}

/**
 * Da de alta un gimnasio REAL en una base recién migrada: la fila en
 * `app.gyms`, su configuración, el catálogo de planes confirmado y su
 * primer DUENO — todo en UNA transacción.
 *
 * Existe porque `db:seed` arma el gimnasio "· DEMO" con el usuario de la
 * sesión simulada: sirve para desarrollo, no para producción. Y es atómico
 * a propósito: `app.gyms` tiene FORCE RLS, así que un gimnasio sin
 * usuarios es invisible para estos scripts — si el alta quedara a medias,
 * correrla otra vez crearía un duplicado sin que nadie lo note.
 *
 * El usuario de Supabase Auth se crea ANTES desde el panel de Supabase
 * (Authentication → Users → Add user, con "Auto Confirm User"): de ahí sale
 * el UID que se pasa en --auth-id. Para sumar más personas a un gimnasio
 * que ya existe, `npm run db:provision-owner`.
 *
 *   npm run db:prod:provision-gym -- --gimnasio "Fuerza Natural" \
 *     --auth-id <UID de Supabase> --email diego@… --nombre "Diego …"
 *
 * Los precios iniciales son los confirmados en docs/REGLAS-DE-NEGOCIO.md;
 * después se ajustan desde Configuración, nunca volviendo a correr esto.
 */

/** El auth_user_id de la sesión simulada: jamás debe usarse para un usuario real. */
const AUTH_USER_ID_DEMO = "00000000-0000-0000-0000-000000000001";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ErrorDeUso extends Error {}

async function main() {
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) {
    throw new ErrorDeUso(
      "Falta DATABASE_URL_OWNER. En producción se corre con `npm run db:prod:provision-gym`, " +
        "que la toma de .env.produccion.local.",
    );
  }

  const args = leerArgumentos(process.argv.slice(2));
  const nombreGimnasio = args.get("gimnasio")?.trim() ?? "";
  const authId = args.get("auth-id")?.trim() ?? "";
  const email = args.get("email")?.trim().toLowerCase() ?? "";
  const nombre = args.get("nombre")?.trim() ?? "";

  if (!nombreGimnasio) throw new ErrorDeUso('--gimnasio es obligatorio, p. ej. --gimnasio "Fuerza Natural".');
  if (/demo/i.test(nombreGimnasio)) {
    throw new ErrorDeUso("Un gimnasio real no se llama DEMO: el de desarrollo lo crea `npm run db:seed`.");
  }
  if (!UUID.test(authId)) throw new ErrorDeUso(`--auth-id no es un UUID válido: ${authId || "(vacío)"}`);
  if (authId === AUTH_USER_ID_DEMO) {
    throw new ErrorDeUso("Ese es el UID de la sesión simulada de desarrollo: no puede ser un dueño real.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorDeUso(`--email no es válido: ${email || "(vacío)"}`);
  if (!nombre) throw new ErrorDeUso("--nombre es obligatorio: es el nombre que firma cada acción del dueño.");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  try {
    const existentes = await listarGimnasios(client);
    const mismoNombre = existentes.find(
      (g) => g.nombre.trim().toLowerCase() === nombreGimnasio.toLowerCase(),
    );
    if (mismoNombre) {
      throw new ErrorDeUso(
        `Ya existe "${mismoNombre.nombre}" (${mismoNombre.id}, ${mismoNombre.usuarios} usuario(s)). ` +
          "Para sumarle personas: npm run db:prod:provision-owner.",
      );
    }
    const [vinculado] = await client<{ gym_id: string }[]>`
      SELECT gym_id FROM app.app_users WHERE auth_user_id = ${authId}
    `;
    if (vinculado) {
      throw new ErrorDeUso(`Ese UID ya está vinculado al gimnasio ${vinculado.gym_id}.`);
    }

    const gymId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.gym_id', ${gymId}, true)`);
      await tx.insert(gyms).values({ id: gymId, nombre: nombreGimnasio });
      await tx.insert(gymSettings).values({ gymId, precioMedioMes: PRECIO_MEDIO_MES_INICIAL });
      for (const plan of CATALOGO_PLANES_INICIAL) {
        await tx.insert(plans).values({ id: randomUUID(), gymId, ...plan });
      }
      await tx.insert(appUsers).values({ gymId, authUserId: authId, email, nombre, rol: "DUENO" });
    });

    console.log(`✓ Gimnasio "${nombreGimnasio}" creado.`);
    console.log(`  gym_id     ${gymId}`);
    console.log(`  dueño      ${nombre} <${email}>  (DUENO, activo)`);
    console.log(`  planes     ${CATALOGO_PLANES_INICIAL.map((p) => p.nombre).join(", ")}`);
    console.log("  LIBRE queda SIN precio: el dueño todavía no lo confirmó. Se carga desde Configuración.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  if (err instanceof ErrorDeUso) {
    console.error(`✗ ${err.message}`);
  } else {
    console.error("✗ Alta del gimnasio falló:", err);
  }
  process.exit(1);
});
