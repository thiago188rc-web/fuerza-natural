import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, ok, type Result } from "@/use-cases/_kernel/result";
import { obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";

/**
 * "Hoy" para la UI (el `max` de un input de fecha, el valor por defecto de
 * un alta). Se calcula en el SERVIDOR, en la zona horaria del gimnasio.
 *
 * Podría parecer más simple hacer `new Date()` en el navegador. No lo es:
 * la computadora del gimnasio puede tener mal la hora o el huso, y un alta
 * cargada a las 22:30 terminaría con la fecha de mañana. Es exactamente la
 * clase de bug que `src/domain/fechas/hoy.ts` existe para eliminar, y por
 * eso la fecha viaja del servidor al cliente, nunca al revés.
 */
export const obtenerHoyDelGimnasioQuery = withAuth<void, string>(
  ["DUENO", "STAFF"],
  async (ctx) => {
    return withTenantTx<Result<string>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      if (!gym) return conflict("No pudimos leer la configuración del gimnasio.");
      return ok(hoyISO(gym.timezone));
    });
  },
);
