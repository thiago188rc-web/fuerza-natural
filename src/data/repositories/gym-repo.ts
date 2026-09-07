import { eq } from "drizzle-orm";
import { gyms } from "@/data/schema";
import type { AuthContext } from "@/lib/auth/context";
import type { TxClient } from "@/use-cases/_kernel/with-tenant-tx";

/**
 * El gimnasio del contexto. Se usa sobre todo para una cosa: su zona
 * horaria, que es la única fuente válida de "hoy" en todo el sistema
 * (SPEC V1 §14.1 — nunca `new Date()` del cliente, nunca UTC del servidor).
 */
export async function obtenerGimnasio(tx: TxClient, ctx: AuthContext) {
  const [row] = await tx
    .select({ id: gyms.id, nombre: gyms.nombre, timezone: gyms.timezone, moneda: gyms.moneda })
    .from(gyms)
    .where(eq(gyms.id, ctx.gymId));
  return row ?? null;
}
