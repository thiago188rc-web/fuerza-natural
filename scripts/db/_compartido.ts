import type postgres from "postgres";

/**
 * Lo que comparten los scripts administrativos de scripts/db/. Nada de acá
 * lo importa la aplicación: los precios del catálogo inicial pueden vivir
 * en scripts/ (el test de precios hardcodeados solo recorre src/), pero
 * nunca en src/.
 */

/**
 * Los cinco planes y los precios que el dueño confirmó
 * (docs/REGLAS-DE-NEGOCIO.md §1 y §2). Son el punto de PARTIDA de un
 * gimnasio nuevo: después se editan desde Configuración, y cambiarlos no
 * toca ningún pago ya registrado — cada pago conserva su snapshot.
 *
 * LIBRE va con `precioActual: null` a propósito: el dueño todavía NO
 * confirmó su precio, y un 0 diría que el plan es gratis. `acceso:
 * "LIBRE"` significa "5 días o más por semana, incluye sábados", con
 * `diasSemana` leído como piso — por eso no es lo mismo que "5 días",
 * aunque históricamente hayan costado igual.
 */
export const CATALOGO_PLANES_INICIAL = [
  { nombre: "2 días", diasSemana: 2, acceso: "DIAS_FIJOS", precioActual: "50000", orden: 1 },
  { nombre: "3 días", diasSemana: 3, acceso: "DIAS_FIJOS", precioActual: "55000", orden: 2 },
  { nombre: "4 días", diasSemana: 4, acceso: "DIAS_FIJOS", precioActual: "60000", orden: 3 },
  { nombre: "5 días", diasSemana: 5, acceso: "DIAS_FIJOS", precioActual: "65000", orden: 4 },
  { nombre: "LIBRE", diasSemana: 5, acceso: "LIBRE", precioActual: null, orden: 5 },
] as const;

/**
 * $45.000 confirmado por el dueño para la modalidad "1/2 MES". Vive en la
 * configuración del gimnasio, no como un plan: `students.plan_id`
 * referencia `plans`, así que un "1/2 MES" ahí dentro podría asignarse
 * como plan habitual de alguien — exactamente lo que la regla prohíbe.
 */
export const PRECIO_MEDIO_MES_INICIAL = "45000";

/** `--clave valor` y `--clave=valor` → Map. Lo que no empieza con `--` se ignora. */
export function leerArgumentos(argv: string[]): Map<string, string> {
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
export async function listarGimnasios(sql: postgres.Sql) {
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

/** Nunca imprimir una contraseña: este texto puede terminar en un chat. */
export function enmascarar(url: string): string {
  return url.replace(/(:\/\/[^:]+:)[^@]*(@)/, "$1***$2");
}
