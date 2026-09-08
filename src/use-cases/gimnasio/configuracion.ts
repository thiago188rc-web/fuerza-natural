import { z } from "zod";
import { withAuth } from "@/use-cases/_kernel/with-auth";
import { parseInput } from "@/use-cases/_kernel/with-validation";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { logActivity } from "@/use-cases/_kernel/with-audit";
import { ok, validationError, type Result } from "@/use-cases/_kernel/result";
import {
  actualizarParametros,
  actualizarPrecioDePlan,
  actualizarPrecioMedioMes,
  listarPlanes,
  obtenerConfiguracion,
} from "@/data/repositories/gym-repo";
import { gymSettingsSchema } from "@/schemas/gym-settings";

/**
 * CONFIGURACIÓN — lo que el dueño puede cambiar sin tocar código.
 *
 * Solo DUEÑO. Los precios y los umbrales con los que se decide quién está
 * al día no son una preferencia de interfaz: son política del negocio.
 *
 * Cambiar un precio NO altera ningún pago ya registrado. Cada pago guarda
 * su propio snapshot de monto y de plan, y esa es exactamente la razón por
 * la que el snapshot existe (docs/REGLAS-DE-NEGOCIO.md §2). Este caso de
 * uso escribe en `plans` y en `gym_settings`, nunca en `payments`.
 */

/**
 * Un precio vacío es `null`: "todavía no confirmado". Es un estado real
 * del negocio —hoy, el de LIBRE— y no se traduce a 0, porque un 0 diría
 * que el plan es gratis y el formulario de cobro lo autocompletaría.
 */
const precioOpcional = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const limpio = v.trim();
  if (limpio === "") return null;

  // "50.000" es cincuenta mil, no cincuenta. `Number("50.000")` devuelve 50
  // y guardaría un precio mil veces menor sin que nadie se entere, así que
  // los separadores se sacan ANTES de convertir: el punto agrupa miles y la
  // coma separa decimales, como se escribe en Argentina.
  return limpio.replace(/[.\s]/g, "").replace(",", ".");
}, z.coerce.number().min(0, "El precio no puede ser negativo.").max(99_999_999).nullable());

export const preciosSchema = z.object({
  precios: z.array(z.object({ planId: z.string().uuid(), precio: precioOpcional })).max(30),
  precioMedioMes: precioOpcional,
});

export type PreciosRaw = z.input<typeof preciosSchema>;

export const actualizarPreciosAction = withAuth<PreciosRaw, { cambios: number }>(
  ["DUENO"],
  async (ctx, rawInput) => {
    const parsed = parseInput(preciosSchema, rawInput);
    if (!parsed.ok) return parsed.result;
    const input = parsed.data;

    return withTenantTx<Result<{ cambios: number }>>(ctx, async (tx) => {
      const anteriores = await listarPlanes(tx, ctx);
      const config = await obtenerConfiguracion(tx, ctx);
      const porId = new Map(anteriores.map((p) => [p.id, p]));

      const cambios: string[] = [];

      for (const { planId, precio } of input.precios) {
        const plan = porId.get(planId);
        // Un plan que no es de este gimnasio simplemente no existe para
        // esta sesión: RLS ya lo garantiza, pero avisar es mejor que
        // escribir en silencio sobre nada.
        if (!plan) {
          return validationError([{ path: "precios", message: "Hay un plan que no existe." }]);
        }

        const anterior = plan.precioActual === null ? null : Number(plan.precioActual);
        if (anterior === precio) continue;

        await actualizarPrecioDePlan(tx, ctx, planId, precio);
        cambios.push(
          `${plan.nombre}: ${anterior === null ? "sin precio" : anterior} → ${precio === null ? "sin precio" : precio}`,
        );
      }

      const medioMesAnterior =
        config?.precioMedioMes == null ? null : Number(config.precioMedioMes);
      if (medioMesAnterior !== input.precioMedioMes) {
        await actualizarPrecioMedioMes(tx, ctx, input.precioMedioMes);
        cambios.push(
          `1/2 mes: ${medioMesAnterior === null ? "sin precio" : medioMesAnterior} → ${
            input.precioMedioMes === null ? "sin precio" : input.precioMedioMes
          }`,
        );
      }

      if (cambios.length > 0) {
        await logActivity(tx, ctx, {
          accion: "gym.prices_updated",
          entidad: "gym_settings",
          resumen: `Precios actualizados — ${cambios.join("; ")}`,
        });
      }

      return ok({ cambios: cambios.length });
    });
  },
);

export type ParametrosRaw = z.input<typeof gymSettingsSchema>;

export const actualizarParametrosAction = withAuth<ParametrosRaw, { ok: true }>(
  ["DUENO"],
  async (ctx, rawInput) => {
    const parsed = parseInput(gymSettingsSchema, rawInput);
    if (!parsed.ok) return parsed.result;
    const input = parsed.data;

    if (input.ventanaPagoHasta < input.ventanaPagoDesde) {
      return validationError([
        {
          path: "ventanaPagoHasta",
          message: "El último día de la ventana no puede ser anterior al primero.",
        },
      ]);
    }

    return withTenantTx<Result<{ ok: true }>>(ctx, async (tx) => {
      const anterior = await obtenerConfiguracion(tx, ctx);
      await actualizarParametros(tx, ctx, input);

      await logActivity(tx, ctx, {
        accion: "gym.settings_updated",
        entidad: "gym_settings",
        resumen: `Ventana de pago ${input.ventanaPagoDesde}–${input.ventanaPagoHasta}, ${input.diasGracia} días de gracia, ${input.diasNuevoSinPago} días para alumnos nuevos`,
        cambios: {
          ventanaPagoHasta: {
            antes: anterior?.ventanaPagoHasta ?? null,
            despues: input.ventanaPagoHasta,
          },
          diasGracia: { antes: anterior?.diasGracia ?? null, despues: input.diasGracia },
        },
      });

      return ok({ ok: true as const });
    });
  },
);
