import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, ok, type Result } from "@/use-cases/_kernel/result";
import { listarBajas } from "@/data/repositories/students-repo";
import { obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";
import { primerDiaDelMes, sumarMeses } from "@/domain/fechas/calendario";

/**
 * LAS BAJAS.
 *
 * Existe una pantalla propia por una razón que no es de conveniencia: en
 * este sistema una baja NO borra a nadie. Si las bajas solo se pudieran
 * ver como un filtro del padrón, la idea de que el registro sobrevive
 * quedaría implícita; acá queda dicha, con el motivo, la fecha y el camino
 * para reactivar a la persona si vuelve.
 *
 * `MOTIVO_BAJA_SIN_ESPECIFICAR` no se cuenta como un motivo más: es la
 * marca de que nadie lo eligió todavía, y la pantalla lo muestra aparte
 * para que se pueda completar.
 */

export interface BajaRegistrada {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  planNombre: string;
  fechaAltaOriginal: string;
  bajaFecha: string | null;
  bajaMotivoCodigo: string | null;
  bajaMotivoEtiqueta: string | null;
  bajaObservacion: string | null;
}

export interface MotivoContado {
  codigo: string;
  etiqueta: string;
  total: number;
}

export interface Bajas {
  hoy: string;
  filas: BajaRegistrada[];
  /** Bajas ocurridas en los últimos 6 meses. Es la lectura que importa. */
  recientes: number;
  motivos: MotivoContado[];
  sinMotivo: number;
}

export const bajasQuery = withAuth<void, Bajas>(["DUENO", "STAFF"], async (ctx) => {
  return withTenantTx<Result<Bajas>>(ctx, async (tx) => {
    const gym = await obtenerGimnasio(tx, ctx);
    if (!gym) return conflict("No pudimos leer la configuración del gimnasio.");

    const hoy = hoyISO(gym.timezone);
    const desdeHaceSeisMeses = primerDiaDelMes(sumarMeses(hoy, -5));
    const filas = await listarBajas(tx, ctx, 200);

    const conteo = new Map<string, MotivoContado>();
    let sinMotivo = 0;

    for (const fila of filas) {
      const codigo = fila.bajaMotivoCodigo;
      if (!codigo || codigo === "SIN_ESPECIFICAR") {
        sinMotivo++;
        continue;
      }
      const actual = conteo.get(codigo);
      if (actual) actual.total++;
      else {
        conteo.set(codigo, {
          codigo,
          etiqueta: fila.bajaMotivoEtiqueta ?? codigo,
          total: 1,
        });
      }
    }

    return ok({
      hoy,
      filas,
      recientes: filas.filter((f) => f.bajaFecha !== null && f.bajaFecha >= desdeHaceSeisMeses)
        .length,
      motivos: [...conteo.values()].sort((a, b) => b.total - a.total),
      sinMotivo,
    });
  });
});
