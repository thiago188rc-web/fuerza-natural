import { activityLog } from "@/data/schema";
import type { AuthContext } from "@/lib/auth/context";
import type { TxClient } from "./with-tenant-tx";

export interface CambioCampo {
  antes: unknown;
  despues: unknown;
}

export interface AuditEntry {
  /** ej. "payment.created", "student.deactivated" — catálogo en SPEC V1 §11.1 */
  accion: string;
  entidad: string;
  entidadId?: string;
  /** Frase legible en español, lista para mostrar tal cual. */
  resumen: string;
  cambios?: Record<string, CambioCampo>;
}

/**
 * Escribe en `activity_log`, DENTRO de la misma transacción que el cambio
 * de negocio (recibe el mismo `tx` de `withTenantTx`) — así es imposible
 * modificar datos sin dejar rastro: si esto falla, todo el bloque se
 * revierte. No es un wrapper (`withX(fn)`) a propósito: la auditoría no
 * envuelve nada, se llama explícitamente en el punto exacto donde ocurrió
 * el hecho de negocio, con el resumen ya armado. SPEC V1 §4.10, §11.2.
 *
 * `actor_email_snapshot`/`actor_rol_snapshot` vienen de `ctx`, no de una
 * consulta aparte — sobreviven a que el usuario cambie de rol o se
 * desactive más adelante.
 */
export async function logActivity(
  tx: TxClient,
  ctx: AuthContext,
  entry: AuditEntry,
): Promise<void> {
  await tx.insert(activityLog).values({
    gymId: ctx.gymId,
    actorUserId: ctx.userId,
    actorEmailSnapshot: ctx.email,
    actorRolSnapshot: ctx.rol,
    accion: entry.accion,
    entidad: entry.entidad,
    entidadId: entry.entidadId,
    resumen: entry.resumen,
    cambios: entry.cambios ?? null,
  });
}
