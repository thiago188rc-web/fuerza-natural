import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, ok, type Result } from "@/use-cases/_kernel/result";
import {
  totalCobrado,
  totalesPorMetodo,
  totalesPorModalidad,
  totalesPorPeriodo,
  type GranularidadFacturacion,
} from "@/data/repositories/payments-repo";
import {
  contarMovimientoDelPadron,
  datosDemograficosDeActivos,
  listarAlumnosActivosParaCobertura,
} from "@/data/repositories/students-repo";
import { asistieronEnRango } from "@/data/repositories/attendance-repo";
import { obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";
import {
  claveDeMes,
  etiquetaCorta,
  etiquetaDeMes,
  primerDiaDeLaSemana,
  primerDiaDelAnio,
  primerDiaDelMes,
  sumarDias,
  sumarMeses,
  sumarSemanas,
  ultimoDiaDelAnio,
  ultimoDiaDelMes,
  ultimoDiaDeLaSemana,
} from "@/domain/fechas/calendario";
import {
  distribucionPorEdad,
  distribucionPorGenero,
  type SegmentoDistribucion,
} from "@/domain/metricas/demografia";
import { segmentosDeImporte, type SegmentoImporte } from "@/domain/metricas/facturacion";
import type { VistaMetricas } from "@/domain/metricas/vista";
import { ETIQUETA_MODALIDAD } from "@/domain/pagos/modalidad";
import { METODOS_PAGO, ETIQUETA_METODO, MODALIDADES_PAGO } from "@/schemas/payment";

/**
 * MÉTRICAS DEL NEGOCIO. Una sola transacción, mismo patrón que `panelQuery`.
 *
 * Todo lo que se muestra sale de sumar/agrupar hechos reales — nada de
 * fórmulas inventadas (docs/REGLAS-DE-NEGOCIO.md). "Nuevos" y "volvieron"
 * son el mismo `contarMovimientoDelPadron` que ya usa el Panel, no una
 * cuenta aparte; "método de pago" y "modalidad" son sumas de `payments`
 * agrupadas, no una estimación.
 *
 * `VistaMetricas`/`VISTAS_METRICAS`/`esVistaMetricas` viven en
 * `@/domain/metricas/vista` (no acá): el selector de vista es un Client
 * Component y necesita ese tipo — si lo importara de este archivo, Next.js
 * arrastraría `postgres` al bundle del navegador.
 */

export interface PuntoDeFacturacion {
  /** 'YYYY-MM-DD' — el día, o el primer día de la semana/mes del bucket. */
  periodo: string;
  etiqueta: string;
  total: number;
}

export interface Metricas {
  hoy: string;
  moneda: string;
  vista: VistaMetricas;
  /** Rango que cubre el "resumen del período" (semana/mes/año actual). */
  rango: { desde: string; hasta: string };
  etiquetaDelRango: string;

  facturacion: {
    tendencia: PuntoDeFacturacion[];
    totalDelPeriodo: number;
    cantidadDePagos: number;
    ticketPromedio: number;
  };

  movimiento: { nuevos: number; volvieron: number; dejaron: number; pausaron: number };

  porMetodo: SegmentoImporte[];
  porModalidad: SegmentoImporte[];

  porEdad: SegmentoDistribucion[];
  porGenero: SegmentoDistribucion[];
  totalAlumnosActivos: number;

  asistencia: { asistieron: number; total: number; porcentaje: number };
}

/** Rango del resumen + ventana y granularidad del gráfico de tendencia, según la vista elegida. */
function configDeVista(vista: VistaMetricas, hoy: string) {
  switch (vista) {
    case "semana":
      return {
        desde: primerDiaDeLaSemana(hoy),
        hasta: ultimoDiaDeLaSemana(hoy),
        granularidad: "dia" as GranularidadFacturacion,
        // Últimos 14 días, para que la barra de hoy tenga contexto reciente.
        desdeTendencia: sumarDias(hoy, -13),
        etiquetaDelRango: "Esta semana",
      };
    case "mes":
      return {
        desde: primerDiaDelMes(hoy),
        hasta: ultimoDiaDelMes(hoy),
        granularidad: "semana" as GranularidadFacturacion,
        // Últimas 8 semanas.
        desdeTendencia: primerDiaDeLaSemana(sumarSemanas(hoy, -7)),
        etiquetaDelRango: "Este mes",
      };
    case "anio":
      return {
        desde: primerDiaDelAnio(hoy),
        hasta: ultimoDiaDelAnio(hoy),
        granularidad: "mes" as GranularidadFacturacion,
        // Últimos 12 meses.
        desdeTendencia: primerDiaDelMes(sumarMeses(hoy, -11)),
        etiquetaDelRango: "Este año",
      };
  }
}

/** Los buckets que debe mostrar el gráfico, incluso los que dieron $0. */
function bucketsEsperados(
  vista: VistaMetricas,
  hoy: string,
): { periodo: string; etiqueta: string }[] {
  if (vista === "semana") {
    return Array.from({ length: 14 }, (_, i) => {
      const dia = sumarDias(hoy, -(13 - i));
      return { periodo: dia, etiqueta: etiquetaCorta(dia, hoy) };
    });
  }
  if (vista === "mes") {
    return Array.from({ length: 8 }, (_, i) => {
      const inicio = primerDiaDeLaSemana(sumarSemanas(hoy, -(7 - i)));
      return { periodo: inicio, etiqueta: etiquetaCorta(inicio, hoy) };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const mes = primerDiaDelMes(sumarMeses(hoy, -(11 - i)));
    return { periodo: claveDeMes(mes) + "-01", etiqueta: etiquetaDeMes(mes, { conAnio: false }) };
  });
}

export const metricasQuery = withAuth<VistaMetricas | undefined, Metricas>(
  ["DUENO", "STAFF"],
  async (ctx, vistaPedida) => {
    const vista = vistaPedida ?? "mes";

    return withTenantTx<Result<Metricas>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      if (!gym) return conflict("No pudimos leer la configuración del gimnasio.");

      const hoy = hoyISO(gym.timezone);
      const config = configDeVista(vista, hoy);
      const rango = { desde: config.desde, hasta: config.hasta };
      const rangoTendencia = { desde: config.desdeTendencia, hasta: hoy };

      const [
        totalesTendencia,
        cobradoDelPeriodo,
        movimiento,
        filasMetodo,
        filasModalidad,
        demografia,
        activos,
        asistieron,
      ] = await Promise.all([
        totalesPorPeriodo(tx, ctx, rangoTendencia, config.granularidad),
        totalCobrado(tx, ctx, rango),
        contarMovimientoDelPadron(tx, ctx, rango),
        totalesPorMetodo(tx, ctx, rango),
        totalesPorModalidad(tx, ctx, rango),
        datosDemograficosDeActivos(tx, ctx),
        listarAlumnosActivosParaCobertura(tx, ctx),
        asistieronEnRango(tx, ctx, rango),
      ]);

      const porPeriodo = new Map(totalesTendencia.map((f) => [f.periodo, f.total]));
      const tendencia: PuntoDeFacturacion[] = bucketsEsperados(vista, hoy).map((b) => ({
        periodo: b.periodo,
        etiqueta: b.etiqueta,
        total: porPeriodo.get(b.periodo) ?? 0,
      }));

      const asistieronDeActivos = activos.filter((a) => asistieron.has(a.id)).length;

      return ok({
        hoy,
        moneda: gym.moneda,
        vista,
        rango,
        etiquetaDelRango: config.etiquetaDelRango,

        facturacion: {
          tendencia,
          totalDelPeriodo: cobradoDelPeriodo.total,
          cantidadDePagos: cobradoDelPeriodo.cantidad,
          ticketPromedio:
            cobradoDelPeriodo.cantidad === 0
              ? 0
              : Math.round(cobradoDelPeriodo.total / cobradoDelPeriodo.cantidad),
        },

        movimiento,

        porMetodo: segmentosDeImporte(filasMetodo, ETIQUETA_METODO, METODOS_PAGO),
        porModalidad: segmentosDeImporte(filasModalidad, ETIQUETA_MODALIDAD, MODALIDADES_PAGO),

        porEdad: distribucionPorEdad(demografia, hoy),
        porGenero: distribucionPorGenero(demografia),
        totalAlumnosActivos: activos.length,

        asistencia: {
          asistieron: asistieronDeActivos,
          total: activos.length,
          porcentaje:
            activos.length === 0 ? 0 : Math.round((asistieronDeActivos / activos.length) * 100),
        },
      });
    });
  },
);
