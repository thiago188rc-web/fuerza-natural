import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, ok, type Result } from "@/use-cases/_kernel/result";
import { totalesMensuales } from "@/data/repositories/payments-repo";
import {
  datosDemograficosDeActivos,
  listarAlumnosActivosParaCobertura,
} from "@/data/repositories/students-repo";
import { asistieronEnRango } from "@/data/repositories/attendance-repo";
import { obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";
import { claveDeMes, etiquetaDeMes, primerDiaDelMes, sumarDias, sumarMeses } from "@/domain/fechas/calendario";
import {
  distribucionPorEdad,
  distribucionPorGenero,
  type SegmentoDistribucion,
} from "@/domain/metricas/demografia";

/**
 * MÉTRICAS DEL NEGOCIO. Una sola transacción, mismo patrón que `panelQuery`.
 *
 * Ninguna cifra acá es una fórmula inventada: facturación suma pagos
 * reales, demografía buckea datos cargados (con "sin dato" como segmento
 * explícito, nunca oculto), y asistencia cuenta hechos registrados en
 * `attendance` — no una "asistencia esperada" que nadie confirmó
 * (docs/REGLAS-DE-NEGOCIO.md).
 */

const MESES_DE_FACTURACION = 6;
const VENTANA_ASISTENCIA_DIAS = 30;

export interface MesDeFacturacion {
  /** 'YYYY-MM' */
  mes: string;
  etiqueta: string;
  total: number;
}

export interface Metricas {
  hoy: string;
  moneda: string;
  facturacion: MesDeFacturacion[];
  totalFacturadoMesActual: number;
  porEdad: SegmentoDistribucion[];
  porGenero: SegmentoDistribucion[];
  totalAlumnosActivos: number;
  asistenciaUltimos30Dias: { asistieron: number; total: number; porcentaje: number };
}

export const metricasQuery = withAuth<void, Metricas>(["DUENO", "STAFF"], async (ctx) => {
  return withTenantTx<Result<Metricas>>(ctx, async (tx) => {
    const gym = await obtenerGimnasio(tx, ctx);
    if (!gym) return conflict("No pudimos leer la configuración del gimnasio.");

    const hoy = hoyISO(gym.timezone);
    const desdeFacturacion = primerDiaDelMes(sumarMeses(hoy, -(MESES_DE_FACTURACION - 1)));
    const desdeAsistencia = sumarDias(hoy, -(VENTANA_ASISTENCIA_DIAS - 1));

    const [totalesPorMes, demografia, activos, asistieron] = await Promise.all([
      totalesMensuales(tx, ctx, { desde: desdeFacturacion, hasta: hoy }),
      datosDemograficosDeActivos(tx, ctx),
      listarAlumnosActivosParaCobertura(tx, ctx),
      asistieronEnRango(tx, ctx, { desde: desdeAsistencia, hasta: hoy }),
    ]);

    const porMes = new Map(totalesPorMes.map((f) => [f.mes, f.total]));
    const facturacion: MesDeFacturacion[] = [];
    for (let i = MESES_DE_FACTURACION - 1; i >= 0; i--) {
      const mes = primerDiaDelMes(sumarMeses(hoy, -i));
      const clave = claveDeMes(mes);
      facturacion.push({
        mes: clave,
        etiqueta: etiquetaDeMes(mes, { conAnio: false }),
        total: porMes.get(clave) ?? 0,
      });
    }

    const asistieronDeActivos = activos.filter((a) => asistieron.has(a.id)).length;

    return ok({
      hoy,
      moneda: gym.moneda,
      facturacion,
      totalFacturadoMesActual: facturacion.at(-1)?.total ?? 0,
      porEdad: distribucionPorEdad(demografia, hoy),
      porGenero: distribucionPorGenero(demografia),
      totalAlumnosActivos: activos.length,
      asistenciaUltimos30Dias: {
        asistieron: asistieronDeActivos,
        total: activos.length,
        porcentaje:
          activos.length === 0 ? 0 : Math.round((asistieronDeActivos / activos.length) * 100),
      },
    });
  });
});
