import { sql } from "drizzle-orm";
import { getDb } from "@/data/db";
import type { AuthContext } from "@/lib/auth/context";

/** El tipo exacto del `tx` que recibe el callback de `db.transaction()`. */
export type TxClient = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Abre una transacción de Drizzle y fija el contexto de tenant como
 * PRIMERA operación, antes de cualquier otra query. Toda escritura y toda
 * lectura que dependa de RLS debe pasar por acá — nunca usar `getDb()`/
 * `getSql()` directo fuera de este wrapper para tocar tablas de negocio.
 *
 * `set_config(..., true)` — el tercer argumento `true` es `is_local`, NO
 * `SET`/`SET LOCAL` con el valor concatenado en el SQL. Esto es crítico
 * con un connection pooler en modo transacción (Supavisor en :6543): una
 * misma conexión física sirve peticiones de distintos gimnasios; un `SET`
 * de sesión filtraría el gym_id de una petición a la siguiente.
 * `set_config(..., true)` es transaccional y se limpia solo en
 * COMMIT/ROLLBACK. Los tres valores viajan como parámetros bindeados
 * (nunca concatenados en el SQL) — ver SPEC V1 §3.2.
 *
 * Si algo dentro de `fn` lanza, la transacción entera se revierte —
 * incluida cualquier escritura de auditoría ya hecha en el mismo bloque
 * (así es como `withAudit` logra atomicidad real, no por convención).
 */
export async function withTenantTx<T>(
  ctx: AuthContext,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.gym_id', ${ctx.gymId}, true)`);
    await tx.execute(sql`select set_config('app.user_id', ${ctx.userId}, true)`);
    await tx.execute(sql`select set_config('app.role', ${ctx.rol}, true)`);
    return fn(tx);
  });
}
