import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

if (existsSync(resolve(process.cwd(), ".env.local"))) {
  loadEnv({ path: resolve(process.cwd(), ".env.local"), override: false, quiet: true });
}

/**
 * Vincula un usuario REAL de Supabase Auth con una fila de `app.app_users`.
 *
 * Este es el único camino para que exista un DUENO de verdad, y es
 * deliberadamente un script administrativo y no una pantalla: si la
 * aplicación pudiera crear usuarios con rol, cualquiera que llegue a esa
 * pantalla podría asignarse DUENO de un gimnasio ajeno. Acá hace falta la
 * credencial de migraciones (DATABASE_URL_OWNER), que la app en runtime no
 * tiene y que nunca se configura en Vercel.
 *
 * No crea nada en Supabase Auth: el usuario (email + contraseña) se crea
 * antes desde el panel de Supabase, y de ahí sale el UUID que se pasa acá.
 * Tampoco crea el gimnasio: eso lo hace `npm run db:seed`.
 *
 *   npm run db:provision-owner -- \
 *     --auth-id 3f7c… --gym-id 9a21… --email diego@… --nombre "Diego"
 *
 * Sin --gym-id lista los gimnasios conocidos y no escribe nada.
 * --rol STAFF crea un usuario de mostrador en vez de un dueño.
 */

/** El auth_user_id de la sesión simulada: jamás debe usarse para un usuario real. */
const AUTH_USER_ID_DEMO = "00000000-0000-0000-0000-000000000001";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ["DUENO", "STAFF"] as const;

class ErrorDeUso extends Error {}

function leerArgumentos(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const actual = argv[i]!;
    if (!actual.startsWith("--")) continue;
    const igual = actual.indexOf("=");
    if (igual !== -1) {
      args.set(actual.slice(2, igual), actual.slice(igual + 1));
    } else {
      const siguiente = argv[i + 1];
      args.set(actual.slice(2), siguiente && !siguiente.startsWith("--") ? siguiente : "");
      if (siguiente && !siguiente.startsWith("--")) i++;
    }
  }
  return args;
}

/**
 * Los gimnasios que se pueden ver desde acá. `app.gyms` tiene FORCE ROW
 * LEVEL SECURITY, así que ni siquiera el dueño del esquema los lista sin
 * contexto de tenant: hay que preguntar de a uno, y los ids salen de
 * `app_users` (que no tiene FORCE, justamente para poder arrancar).
 * Un gimnasio sin ningún usuario todavía no aparece — para ese caso hay
 * que pasar --gym-id a mano.
 */
async function listarGimnasios(sql: postgres.Sql) {
  return sql.begin(async (tx) => {
    const ids = await tx<{ gym_id: string }[]>`SELECT DISTINCT gym_id FROM app.app_users`;
    const salida: { id: string; nombre: string; usuarios: number }[] = [];
    for (const { gym_id } of ids) {
      await tx`SELECT set_config('app.gym_id', ${gym_id}, true)`;
      const [gym] = await tx<{ nombre: string }[]>`
        SELECT nombre FROM app.gyms WHERE id = ${gym_id}
      `;
      const [{ total }] = await tx<{ total: number }[]>`
        SELECT count(*)::int AS total FROM app.app_users WHERE gym_id = ${gym_id}
      `;
      salida.push({ id: gym_id, nombre: gym?.nombre ?? "(sin nombre)", usuarios: total });
    }
    return salida;
  });
}

async function main() {
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) {
    throw new ErrorDeUso(
      "Falta DATABASE_URL_OWNER. Este script escribe con el rol de migraciones (fn_owner), " +
        "no con el de la aplicación — es intencional. Ver .env.example.",
    );
  }

  const args = leerArgumentos(process.argv.slice(2));
  const sql = postgres(url, { max: 1 });

  try {
    const gymId = args.get("gym-id")?.trim() ?? "";

    if (!gymId) {
      const gimnasios = await listarGimnasios(sql);
      console.log("Gimnasios conocidos:\n");
      if (gimnasios.length === 0) {
        console.log("  (ninguno todavía — corré primero: npm run db:seed)\n");
      }
      for (const g of gimnasios) {
        console.log(`  ${g.id}  ${g.nombre}  ·  ${g.usuarios} usuario(s)`);
      }
      console.log(
        "\nVolvé a correr el comando agregando --gym-id, por ejemplo:\n" +
          "  npm run db:provision-owner -- --gym-id <id> --auth-id <uuid de Supabase> \\\n" +
          '    --email persona@gimnasio.com --nombre "Nombre Apellido"',
      );
      return;
    }

    const authId = args.get("auth-id")?.trim() ?? "";
    const email = args.get("email")?.trim() ?? "";
    const nombre = args.get("nombre")?.trim() ?? "";
    const rol = (args.get("rol")?.trim() || "DUENO").toUpperCase();

    if (!UUID.test(gymId)) throw new ErrorDeUso(`--gym-id no es un UUID válido: ${gymId}`);
    if (!UUID.test(authId)) {
      throw new ErrorDeUso(
        "--auth-id tiene que ser el UUID del usuario en Supabase Auth " +
          "(Authentication → Users → columna UID).",
      );
    }
    if (authId.toLowerCase() === AUTH_USER_ID_DEMO) {
      throw new ErrorDeUso(
        "Ese UUID es el de la sesión simulada de desarrollo, no el de una persona real. " +
          "Copiá el UID del usuario desde Supabase → Authentication → Users.",
      );
    }
    if (!email.includes("@")) throw new ErrorDeUso(`--email no parece un email: ${email || "(vacío)"}`);
    if (!nombre) throw new ErrorDeUso("--nombre es obligatorio: es el nombre que firma cada acción.");
    if (!ROLES.includes(rol as (typeof ROLES)[number])) {
      throw new ErrorDeUso(`--rol tiene que ser DUENO o STAFF (recibí "${rol}").`);
    }

    const resultado = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.gym_id', ${gymId}, true)`;

      const [gym] = await tx<{ nombre: string }[]>`
        SELECT nombre FROM app.gyms WHERE id = ${gymId}
      `;
      if (!gym) {
        throw new ErrorDeUso(
          `No existe ningún gimnasio con id ${gymId}. Corré el comando sin --gym-id para ver la lista.`,
        );
      }

      const [existente] = await tx<{ id: string; gym_id: string; rol: string }[]>`
        SELECT id, gym_id, rol FROM app.app_users WHERE auth_user_id = ${authId}
      `;

      if (existente && existente.gym_id !== gymId) {
        throw new ErrorDeUso(
          `Ese usuario de Supabase ya está vinculado a otro gimnasio (${existente.gym_id}). ` +
            "Un usuario pertenece a un solo gimnasio: revisá el --gym-id.",
        );
      }

      if (existente) {
        await tx`
          UPDATE app.app_users
             SET email = ${email}, nombre = ${nombre}, rol = ${rol}, activo = true
           WHERE auth_user_id = ${authId}
        `;
        return { gimnasio: gym.nombre, creado: false };
      }

      await tx`
        INSERT INTO app.app_users (gym_id, auth_user_id, email, nombre, rol, activo)
        VALUES (${gymId}, ${authId}, ${email}, ${nombre}, ${rol}, true)
      `;
      return { gimnasio: gym.nombre, creado: true };
    });

    console.log(resultado.creado ? "✓ Usuario vinculado." : "✓ Usuario ya vinculado: datos actualizados.");
    console.log(`  gimnasio   ${resultado.gimnasio} (${gymId})`);
    console.log(`  persona    ${nombre} <${email}>`);
    console.log(`  rol        ${rol}`);
    console.log(`  auth_id    ${authId}`);
    if (rol === "DUENO") {
      console.log(
        "\n  Al entrar por primera vez, /login lo va a mandar a configurar la verificación\n" +
          "  en dos pasos: DUENO exige aal2 en cada operación. Con una app de autenticación\n" +
          "  (Google Authenticator, Authy, 1Password) escanea el QR y queda listo.",
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  if (err instanceof ErrorDeUso) {
    console.error(`✗ ${err.message}`);
  } else {
    console.error("✗ No se pudo vincular el usuario:", err);
  }
  process.exit(1);
});
