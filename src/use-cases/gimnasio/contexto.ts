import { cache } from "react";
import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, ok, type Result } from "@/use-cases/_kernel/result";
import { listarPlanes, obtenerConfiguracion, obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";
import type { ParametrosDeCobertura } from "@/domain/pagos/cobertura";
import { isDevMockAuthEnabled } from "@/lib/auth/config";

/**
 * TODO lo que la interfaz necesita saber del gimnasio antes de dibujar
 * una pantalla: cómo se llama, qué día es hoy en SU huso, con qué
 * parámetros se deriva la situación de pago, qué planes existen y a qué
 * precio, y qué motivos de baja ofrecer.
 *
 * Una sola query para todo eso, y no cinco, por una razón concreta: son
 * datos de política que cambian una vez por año y que cada pantalla
 * necesita enteros. Traerlos por separado multiplicaría las transacciones
 * sin ganar nada.
 *
 * Lo importante: NADA de esto está hardcodeado en la UI. Los precios, los
 * umbrales y los motivos son datos (docs/REGLAS-DE-NEGOCIO.md §2). Si el
 * dueño cambia un precio, la interfaz lo refleja sin tocar código, y los
 * pagos ya registrados no se mueven.
 */

export interface PlanDelGimnasio {
  id: string;
  nombre: string;
  diasSemana: number;
  /** "DIAS_FIJOS" | "LIBRE" — LIBRE es una modalidad de acceso, no un plan aparte. */
  acceso: string;
  /** `null` = precio todavía no confirmado por el dueño. Nunca 0. */
  precio: number | null;
  activo: boolean;
}

export interface MotivoDeBaja {
  codigo: string;
  etiqueta: string;
  orden: number;
  activo: boolean;
}

export interface ContextoDelGimnasio {
  nombre: string;
  moneda: string;
  timezone: string;
  /** Hoy en la zona horaria del gimnasio, en ISO. La UI nunca lo calcula. */
  hoy: string;
  parametros: ParametrosDeCobertura;
  /** Día del mes en el que el gimnasio espera el pago. */
  ventanaPagoDesde: number;
  /** Precio de la modalidad 1/2 mes. `null` si el dueño no lo confirmó. */
  precioMedioMes: number | null;
  /** Antes de esta fecha no se reclama nada (gracia post-migración). */
  alertasDesde: string;
  planes: PlanDelGimnasio[];
  motivosBaja: MotivoDeBaja[];
}

function aNumero(valor: string | null): number | null {
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export const contextoDelGimnasioQuery = withAuth<void, ContextoDelGimnasio>(
  ["DUENO", "STAFF"],
  async (ctx) => {
    return withTenantTx<Result<ContextoDelGimnasio>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      const config = await obtenerConfiguracion(tx, ctx);
      if (!gym || !config) {
        if (isDevMockAuthEnabled()) {
          const tz = "America/Argentina/Buenos_Aires";
          return ok({
            nombre: "Fuerza Natural · DEMO",
            moneda: "ARS",
            timezone: tz,
            hoy: hoyISO(tz),
            parametros: {
              ventanaPagoHasta: 10,
              diasGracia: 5,
              diasNuevoSinPago: 7,
            },
            ventanaPagoDesde: 1,
            precioMedioMes: 45000,
            alertasDesde: "2026-09-01",
            planes: [
              { id: "1", nombre: "2 días", diasSemana: 2, acceso: "DIAS_FIJOS", precio: 50000, activo: true },
              { id: "2", nombre: "3 días", diasSemana: 3, acceso: "DIAS_FIJOS", precio: 55000, activo: true },
              { id: "3", nombre: "4 días", diasSemana: 4, acceso: "DIAS_FIJOS", precio: 60000, activo: true },
              { id: "4", nombre: "5 días", diasSemana: 5, acceso: "DIAS_FIJOS", precio: 65000, activo: true },
              { id: "5", nombre: "LIBRE", diasSemana: 5, acceso: "LIBRE", precio: null, activo: true },
            ],
            motivosBaja: [],
          });
        }
        return conflict("No pudimos leer la configuración del gimnasio.");
      }

      const planes = await listarPlanes(tx, ctx);

      const motivos = Array.isArray(config.motivosBaja)
        ? (config.motivosBaja as MotivoDeBaja[])
            .filter((m) => m && typeof m.codigo === "string")
            .sort((a, b) => a.orden - b.orden)
        : [];

      return ok({
        nombre: gym.nombre,
        moneda: gym.moneda,
        timezone: gym.timezone,
        hoy: hoyISO(gym.timezone),
        parametros: {
          ventanaPagoHasta: config.ventanaPagoHasta,
          diasGracia: config.diasGracia,
          diasNuevoSinPago: config.diasNuevoSinPago,
        },
        ventanaPagoDesde: config.ventanaPagoDesde,
        precioMedioMes: aNumero(config.precioMedioMes),
        alertasDesde: config.alertasDesde,
        planes: planes.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          diasSemana: p.diasSemana,
          acceso: p.acceso,
          precio: aNumero(p.precioActual),
          activo: p.activo,
        })),
        motivosBaja: motivos,
      });
    });
  },
);

/**
 * La versión deduplicada. El layout necesita el nombre del gimnasio y la
 * página necesita los planes y los parámetros; sin `cache()` eso serían
 * dos transacciones idénticas por navegación. React descarta la segunda
 * dentro del mismo render, así que las pantallas pueden pedir el contexto
 * sin pensar en cuántas veces se pide.
 */
export const contextoDelGimnasio = cache(() => contextoDelGimnasioQuery());
