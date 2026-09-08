import { and, eq } from "drizzle-orm";
import { gyms, gymSettings, plans } from "@/data/schema";
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

/**
 * Los parámetros de política del gimnasio. Se leen en casi toda pantalla
 * porque la situación de pago se DERIVA con ellos (ventana, gracia, días
 * de gracia para altas nuevas) — nunca están hardcodeados en el dominio
 * ni en la UI.
 *
 * Incluye `precioMedioMes` y los motivos de baja: los dos son datos
 * configurables que la UI necesita para no inventar opciones ni importes.
 */
export async function obtenerConfiguracion(tx: TxClient, ctx: AuthContext) {
  const [row] = await tx
    .select({
      ventanaPagoDesde: gymSettings.ventanaPagoDesde,
      ventanaPagoHasta: gymSettings.ventanaPagoHasta,
      diasGracia: gymSettings.diasGracia,
      diasNuevoSinPago: gymSettings.diasNuevoSinPago,
      motivosBaja: gymSettings.motivosBaja,
      precioMedioMes: gymSettings.precioMedioMes,
      alertasDesde: gymSettings.alertasDesde,
    })
    .from(gymSettings)
    .where(eq(gymSettings.gymId, ctx.gymId));
  return row ?? null;
}

/** Los planes del gimnasio, ordenados para mostrarse tal cual en la UI. */
export async function listarPlanes(tx: TxClient, ctx: AuthContext) {
  return tx
    .select({
      id: plans.id,
      nombre: plans.nombre,
      diasSemana: plans.diasSemana,
      acceso: plans.acceso,
      precioActual: plans.precioActual,
      activo: plans.activo,
    })
    .from(plans)
    .where(eq(plans.gymId, ctx.gymId))
    .orderBy(plans.orden, plans.nombre);
}

/**
 * Actualiza el precio vigente de un plan.
 *
 * NO toca ningún pago: cada `payments` guarda su propio snapshot de monto,
 * nombre y días del plan. Subir un precio hoy no reescribe la historia —
 * es la regla confirmada por el dueño (docs/REGLAS-DE-NEGOCIO.md §2) y es
 * la razón por la que el snapshot existe.
 *
 * `null` significa "precio no confirmado", que es un estado real del
 * negocio. Nunca se guarda 0 en su lugar: un 0 diría que el plan es gratis.
 */
export async function actualizarPrecioDePlan(
  tx: TxClient,
  ctx: AuthContext,
  planId: string,
  precio: number | null,
) {
  const [row] = await tx
    .update(plans)
    .set({ precioActual: precio === null ? null : precio.toFixed(2), updatedAt: new Date() })
    .where(and(eq(plans.id, planId), eq(plans.gymId, ctx.gymId)))
    .returning({ id: plans.id, nombre: plans.nombre });
  return row ?? null;
}

export interface ParametrosEditables {
  ventanaPagoDesde: number;
  ventanaPagoHasta: number;
  diasGracia: number;
  diasNuevoSinPago: number;
}

/** Los umbrales con los que se DERIVA la situación de pago. */
export async function actualizarParametros(
  tx: TxClient,
  ctx: AuthContext,
  parametros: ParametrosEditables,
) {
  const [row] = await tx
    .update(gymSettings)
    .set({ ...parametros, updatedAt: new Date() })
    .where(eq(gymSettings.gymId, ctx.gymId))
    .returning({ id: gymSettings.id });
  return row ?? null;
}

/** El precio de la modalidad 1/2 mes. Vive en la configuración, no en `plans`. */
export async function actualizarPrecioMedioMes(
  tx: TxClient,
  ctx: AuthContext,
  precio: number | null,
) {
  const [row] = await tx
    .update(gymSettings)
    .set({
      precioMedioMes: precio === null ? null : precio.toFixed(2),
      updatedAt: new Date(),
    })
    .where(eq(gymSettings.gymId, ctx.gymId))
    .returning({ id: gymSettings.id });
  return row ?? null;
}
