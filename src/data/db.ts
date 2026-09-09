import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * Cliente de runtime de la app. Rol `fn_app` — nunca `fn_owner`.
 *
 * `prepare: false` y `max: 1` no son un detalle de performance: son un
 * requisito de correctitud. El pooler en modo transacción (p. ej. Supavisor
 * en el puerto 6543) sirve peticiones distintas sobre la misma conexión
 * física. Con prepared statements habilitados, un statement preparado en
 * una petición puede ejecutarse contra otra sesión lógica — y peor,
 * `SET` (a diferencia de `set_config(..., true)`) filtraría el `gym_id` de
 * un gimnasio a la petición siguiente. Ver SPEC V1 §3.2.
 *
 * Conexión LAZY a propósito: si este módulo conectara al importarse,
 * `next build` fallaría en cualquier entorno sin DATABASE_URL (CI, un
 * checkout limpio). `postgres()` ya es lazy por diseño (no abre socket
 * hasta la primera query), así que alcanza con no lanzar si la env var
 * falta — se falla recién cuando alguien intenta usar la conexión de verdad.
 */
function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // No lanzamos acá: permite que `next build` importe este módulo sin
    // DATABASE_URL configurada. El error real llega la primera vez que se
    // intenta ejecutar una query, con un mensaje claro.
    return postgres("postgres://unset:unset@localhost:1/unset", {
      prepare: false,
      max: 1,
      connect_timeout: 1,
      onnotice: () => {},
    });
  }
  // `connect_timeout` en segundos — sin esto, el default de la librería es
  // 30s: si la conexión no llega (DNS, pooler caído, credencial mala), el
  // login se queda "cargando" en silencio en vez de fallar con un mensaje.
  // 8s alcanza de sobra para un handshake real contra el pooler de Supabase.
  return postgres(url, { prepare: false, max: 1, connect_timeout: 8 });
}

let _sql: ReturnType<typeof postgres> | undefined;

/** Acceso perezoso y memoizado a la conexión de runtime (rol fn_app). */
export function getSql() {
  if (!_sql) _sql = createClient();
  return _sql;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Instancia de Drizzle sobre la conexión de runtime. Se usa SIEMPRE a
 * través de `db.transaction()` (nunca queries sueltas fuera de una
 * transacción con el tenant seteado) — ver with-tenant-tx.ts.
 */
export function getDb() {
  if (!_db) _db = drizzle(getSql(), { schema });
  return _db;
}
