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
  listarCumpleanosDeActivos,
  listarFechasDeVinculo,
  movimientoPorMes,
} from "@/data/repositories/students-repo";
import { asistieronEnRango, contarAsistenciasPorAlumno } from "@/data/repositories/attendance-repo";
import { obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";
import {
  claveDeMes,
  diasDelMes,
  diasEntre,
  etiquetaCorta,
  etiquetaDeMes,
  inicialDelDia,
  primerDiaDeLaSemana,
  primerDiaDelAnio,
  primerDiaDelMes,
  sumarDias,
  sumarMeses,
  ultimoDiaDelAnio,
  ultimoDiaDelMes,
  ultimoDiaDeLaSemana,
} from "@/domain/fechas/calendario";
import {
  distribucionPorEdad,
  distribucionPorEdadYGenero,
  distribucionPorGenero,
  type SegmentoDistribucion,
  type SegmentoEdadGenero,
} from "@/domain/metricas/demografia";
import { distribucionPorFrecuencia } from "@/domain/metricas/asistencia";
import {
  curvaAcumulada,
  segmentosDeImporte,
  type SegmentoImporte,
} from "@/domain/metricas/facturacion";
import { cumpleanosDelMes, type AlumnoConCumpleanos } from "@/domain/alumnos/cumpleanos";
import { activosAlFinDeCadaMes } from "@/domain/metricas/roster";
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
  /** La inicial del día (L M M J V S D). Solo en la vista semana. */
  subEtiqueta?: string;
  total: number;
  /** Cuántos pagos componen ese total. Sirve para "quién pagó" al tocar la barra. */
  cantidad: number;
}

export interface SerieMensual {
  etiqueta: string;
  /** Suma corrida, un valor por día del mes (índice 0 = día 1). */
  acumulado: number[];
}

export interface PuntoDeMovimiento {
  /** 'YYYY-MM-DD' — el primer día del mes. */
  mes: string;
  etiqueta: string;
  nuevos: number;
  volvieron: number;
  dejaron: number;
  /** nuevos + volvieron: cuánta gente entró (por primera vez o de vuelta) ese mes. */
  altas: number;
  /** `false`: el sistema no tiene dato real para ese mes (es anterior al alta más vieja registrada). */
  real: boolean;
}

export interface PuntoDeHistorial {
  mes: string;
  etiqueta: string;
  valor: number;
  /** `false`: el sistema no tiene dato real para ese mes (es anterior al alta más vieja registrada). */
  real: boolean;
}

/** Cuántos meses hacia atrás muestra el historial de altas/bajas (incluye el actual). */
const MESES_DE_HISTORIAL = 7;

export interface MetricasInput {
  vista?: VistaMetricas;
  /**
   * 'YYYY-MM' (o cualquier fecha de ese mes) — qué mes mirar. Solo aplica
   * a la vista "mes"; sin esto, es el mes en curso. Así se navega a meses
   * anteriores o posteriores sin que la vista deje de ser "mes".
   */
  mes?: string;
  /**
   * Cualquier fecha 'YYYY-MM-DD' de la semana a mirar — se normaliza al
   * lunes de esa semana acá adentro, nunca en el cliente. Solo aplica a la
   * vista "semana"; sin esto, es la semana en curso.
   */
  semana?: string;
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
    /** Granularidad de cada punto de `tendencia` — la necesita el cliente para pedir el detalle de una barra. */
    granularidad: GranularidadFacturacion;
    /** Índice del bucket que es "hoy", si hoy cae dentro del rango mostrado. */
    indiceDeHoy: number | null;
    totalDelPeriodo: number;
    cantidadDePagos: number;
    ticketPromedio: number;
  };

  /**
   * Solo con la vista "mes": el acumulado día a día de este mes contra el
   * anterior, para ver de un vistazo si vamos más atrasados o adelantados
   * que el mes pasado a la misma altura.
   */
  comparacionMensual: { mesActual: SerieMensual; mesAnterior: SerieMensual } | null;

  movimiento: { nuevos: number; volvieron: number; dejaron: number; pausaron: number };
  /** Altas y bajas de los últimos meses — el historial completo, no solo el período elegido. */
  historialDeMovimiento: PuntoDeMovimiento[];
  /** Facturado por mes, últimos `MESES_DE_HISTORIAL` meses. */
  facturacionPorMes: PuntoDeHistorial[];
  /** Alumnos activos a fin de cada uno de los últimos `MESES_DE_HISTORIAL` meses. */
  activosPorMes: PuntoDeHistorial[];

  porMetodo: SegmentoImporte[];
  porModalidad: SegmentoImporte[];

  porEdad: SegmentoDistribucion[];
  porGenero: SegmentoDistribucion[];
  porEdadYGenero: SegmentoEdadGenero[];
  totalAlumnosActivos: number;

  asistencia: { asistieron: number; total: number; porcentaje: number };
  /** Promedio de veces por semana que asistió cada activo, en el rango mostrado. */
  porFrecuencia: SegmentoDistribucion[];

  cumpleanos: AlumnoConCumpleanos[];
}

/** Rango del resumen + ventana y granularidad del gráfico de tendencia, según la vista elegida. */
function configDeVista(
  vista: VistaMetricas,
  hoy: string,
  mesReferencia?: string,
  semanaReferencia?: string,
) {
  switch (vista) {
    case "semana": {
      // Semana civil lunes→domingo, no "últimos 7 días": así se puede
      // navegar a la semana anterior/siguiente completa, igual que la
      // vista "mes" navega mes a mes (pedido del dueño).
      const inicio = semanaReferencia
        ? primerDiaDeLaSemana(semanaReferencia)
        : primerDiaDeLaSemana(hoy);
      const fin = ultimoDiaDeLaSemana(inicio);
      const esSemanaActual = inicio === primerDiaDeLaSemana(hoy);
      return {
        desde: inicio,
        hasta: fin,
        granularidad: "dia" as GranularidadFacturacion,
        desdeTendencia: inicio,
        hastaTendencia: fin,
        etiquetaDelRango: esSemanaActual
          ? "Esta semana"
          : `${etiquetaCorta(inicio, hoy)} – ${etiquetaCorta(fin, hoy)}`,
      };
    }
    case "mes": {
      const mes = mesReferencia ? primerDiaDelMes(mesReferencia) : primerDiaDelMes(hoy);
      const esMesActual = mes === primerDiaDelMes(hoy);
      return {
        desde: mes,
        hasta: ultimoDiaDelMes(mes),
        // Por día, no por semana: el mes se navega completo, día a día —
        // es lo que pidió el dueño ("discriminación por días").
        granularidad: "dia" as GranularidadFacturacion,
        desdeTendencia: mes,
        hastaTendencia: ultimoDiaDelMes(mes),
        etiquetaDelRango: esMesActual ? "Este mes" : etiquetaDeMes(mes, { conAnio: true }),
      };
    }
    case "anio":
      return {
        desde: primerDiaDelAnio(hoy),
        hasta: ultimoDiaDelAnio(hoy),
        granularidad: "mes" as GranularidadFacturacion,
        // Últimos 12 meses.
        desdeTendencia: primerDiaDelMes(sumarMeses(hoy, -11)),
        hastaTendencia: hoy,
        etiquetaDelRango: "Este año",
      };
  }
}

/** Los buckets que debe mostrar el gráfico, incluso los que dieron $0. */
function bucketsEsperados(
  vista: VistaMetricas,
  hoy: string,
  mesReferencia?: string,
  semanaReferencia?: string,
): { periodo: string; etiqueta: string; subEtiqueta?: string }[] {
  if (vista === "semana") {
    const inicio = semanaReferencia
      ? primerDiaDeLaSemana(semanaReferencia)
      : primerDiaDeLaSemana(hoy);
    // La inicial del día va SOLO acá: en la vista semana son siete y
    // ordenan la lectura (lunes→domingo). En la vista mes serían 31 letras
    // repetidas bajo 31 números, ruido puro.
    return Array.from({ length: 7 }, (_, i) => {
      const dia = sumarDias(inicio, i);
      return { periodo: dia, etiqueta: etiquetaCorta(dia, hoy), subEtiqueta: inicialDelDia(dia) };
    });
  }
  if (vista === "mes") {
    const mes = mesReferencia ? primerDiaDelMes(mesReferencia) : primerDiaDelMes(hoy);
    return Array.from({ length: diasDelMes(mes) }, (_, i) => {
      const dia = sumarDias(mes, i);
      // Solo el número: el mes ya está en el título de la sección, y 31
      // etiquetas tipo "7 sep" no entran cómodas.
      return { periodo: dia, etiqueta: String(i + 1) };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const mes = primerDiaDelMes(sumarMeses(hoy, -(11 - i)));
    return { periodo: claveDeMes(mes) + "-01", etiqueta: etiquetaDeMes(mes, { conAnio: false }) };
  });
}

export const metricasQuery = withAuth<MetricasInput | undefined, Metricas>(
  ["DUENO", "STAFF"],
  async (ctx, input) => {
    const vista = input?.vista ?? "mes";

    return withTenantTx<Result<Metricas>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      if (!gym) return conflict("No pudimos leer la configuración del gimnasio.");

      const hoy = hoyISO(gym.timezone);
      const config = configDeVista(vista, hoy, input?.mes, input?.semana);
      const rango = { desde: config.desde, hasta: config.hasta };
      const rangoTendencia = { desde: config.desdeTendencia, hasta: config.hastaTendencia };

      const mesAnteriorDesde = vista === "mes" ? sumarMeses(config.desde, -1) : null;
      const rangoMesAnterior = mesAnteriorDesde
        ? { desde: mesAnteriorDesde, hasta: ultimoDiaDelMes(mesAnteriorDesde) }
        : null;

      const mesDeHoy = primerDiaDelMes(hoy);
      const rangoHistorial = {
        desde: primerDiaDelMes(sumarMeses(mesDeHoy, -(MESES_DE_HISTORIAL - 1))),
        hasta: ultimoDiaDelMes(mesDeHoy),
      };

      const [
        totalesTendencia,
        cobradoDelPeriodo,
        movimiento,
        filasMetodo,
        filasModalidad,
        demografia,
        activos,
        asistieron,
        visitasPorAlumno,
        cumpleanos,
        totalesMesAnterior,
        movimientoCrudo,
        facturacionMensualCruda,
        fechasDeVinculo,
      ] = await Promise.all([
        totalesPorPeriodo(tx, ctx, rangoTendencia, config.granularidad),
        totalCobrado(tx, ctx, rango),
        contarMovimientoDelPadron(tx, ctx, rango),
        totalesPorMetodo(tx, ctx, rango),
        totalesPorModalidad(tx, ctx, rango),
        datosDemograficosDeActivos(tx, ctx),
        listarAlumnosActivosParaCobertura(tx, ctx),
        asistieronEnRango(tx, ctx, rango),
        contarAsistenciasPorAlumno(tx, ctx, rango),
        listarCumpleanosDeActivos(tx, ctx),
        rangoMesAnterior
          ? totalesPorPeriodo(tx, ctx, rangoMesAnterior, "dia")
          : Promise.resolve([]),
        movimientoPorMes(tx, ctx, rangoHistorial),
        totalesPorPeriodo(tx, ctx, rangoHistorial, "mes"),
        listarFechasDeVinculo(tx, ctx),
      ]);

      const buckets = bucketsEsperados(vista, hoy, input?.mes, input?.semana);
      const porPeriodo = new Map(totalesTendencia.map((f) => [f.periodo, f]));
      const tendencia: PuntoDeFacturacion[] = buckets.map((b) => ({
        periodo: b.periodo,
        etiqueta: b.etiqueta,
        subEtiqueta: b.subEtiqueta,
        total: porPeriodo.get(b.periodo)?.total ?? 0,
        cantidad: porPeriodo.get(b.periodo)?.cantidad ?? 0,
      }));

      const indiceDeHoyBruto = buckets.findIndex((b) => {
        if (config.granularidad === "mes") return b.periodo === primerDiaDelMes(hoy);
        if (config.granularidad === "semana") {
          return hoy >= b.periodo && hoy <= sumarDias(b.periodo, 6);
        }
        return b.periodo === hoy;
      });
      const indiceDeHoy = indiceDeHoyBruto === -1 ? null : indiceDeHoyBruto;

      let comparacionMensual: Metricas["comparacionMensual"] = null;
      if (vista === "mes" && rangoMesAnterior) {
        const porDiaAnterior = new Map(totalesMesAnterior.map((f) => [f.periodo, f.total]));
        const serieAnterior = Array.from({ length: diasDelMes(rangoMesAnterior.desde) }, (_, i) =>
          porDiaAnterior.get(sumarDias(rangoMesAnterior.desde, i)) ?? 0,
        );

        comparacionMensual = {
          mesActual: {
            etiqueta: etiquetaDeMes(config.desde, { conAnio: false }),
            acumulado: curvaAcumulada(tendencia.map((p) => p.total)),
          },
          mesAnterior: {
            etiqueta: etiquetaDeMes(rangoMesAnterior.desde, { conAnio: false }),
            acumulado: curvaAcumulada(serieAnterior),
          },
        };
      }

      // El corte de "hay dato real" para los tres gráficos de historial de
      // abajo: antes de la alta más vieja que tiene el sistema, un $0, un
      // 0 de activos o un 0 de movimiento no sería "no pasó nada" — sería
      // simplemente que nadie cargó ese mes todavía.
      const altaMasVieja = fechasDeVinculo.reduce<string | null>(
        (min, a) => (min === null || a.fechaAltaOriginal < min ? a.fechaAltaOriginal : min),
        null,
      );

      const finesDeMes = Array.from({ length: MESES_DE_HISTORIAL }, (_, i) =>
        ultimoDiaDelMes(primerDiaDelMes(sumarMeses(mesDeHoy, -(MESES_DE_HISTORIAL - 1 - i)))),
      );

      const porMesYTipo = new Map<string, number>();
      for (const f of movimientoCrudo) porMesYTipo.set(`${f.mes}:${f.tipo}`, f.total);
      const historialDeMovimiento: PuntoDeMovimiento[] = finesDeMes.map((finDeMes) => {
        const mes = primerDiaDelMes(finDeMes);
        const nuevos = porMesYTipo.get(`${mes}:ALTA`) ?? 0;
        const volvieron = porMesYTipo.get(`${mes}:REACTIVACION`) ?? 0;
        const dejaron = porMesYTipo.get(`${mes}:BAJA`) ?? 0;
        return {
          mes,
          etiqueta: etiquetaDeMes(mes, { conAnio: false }),
          nuevos,
          volvieron,
          dejaron,
          altas: nuevos + volvieron,
          real: altaMasVieja !== null && finDeMes >= altaMasVieja,
        };
      });

      const porMesFacturacion = new Map(facturacionMensualCruda.map((f) => [f.periodo, f.total]));
      const facturacionPorMes: PuntoDeHistorial[] = finesDeMes.map((finDeMes) => {
        const mes = primerDiaDelMes(finDeMes);
        return {
          mes,
          etiqueta: etiquetaDeMes(mes, { conAnio: false }),
          valor: porMesFacturacion.get(mes) ?? 0,
          real: altaMasVieja !== null && finDeMes >= altaMasVieja,
        };
      });

      const activosPorMes: PuntoDeHistorial[] = activosAlFinDeCadaMes(
        fechasDeVinculo,
        finesDeMes,
      ).map((a) => ({
        mes: primerDiaDelMes(a.mes),
        etiqueta: etiquetaDeMes(a.mes, { conAnio: false }),
        valor: a.cantidad,
        real: a.real,
      }));

      const asistieronDeActivos = activos.filter((a) => asistieron.has(a.id)).length;
      const diasDelRango = diasEntre(rango.desde, rango.hasta) + 1;
      const porFrecuencia = distribucionPorFrecuencia(
        activos.map((a) => visitasPorAlumno.get(a.id) ?? 0),
        diasDelRango,
      );

      return ok({
        hoy,
        moneda: gym.moneda,
        vista,
        rango,
        etiquetaDelRango: config.etiquetaDelRango,

        facturacion: {
          tendencia,
          granularidad: config.granularidad,
          indiceDeHoy,
          totalDelPeriodo: cobradoDelPeriodo.total,
          cantidadDePagos: cobradoDelPeriodo.cantidad,
          ticketPromedio:
            cobradoDelPeriodo.cantidad === 0
              ? 0
              : Math.round(cobradoDelPeriodo.total / cobradoDelPeriodo.cantidad),
        },

        comparacionMensual,

        movimiento,
        historialDeMovimiento,
        facturacionPorMes,
        activosPorMes,

        porMetodo: segmentosDeImporte(filasMetodo, ETIQUETA_METODO, METODOS_PAGO),
        porModalidad: segmentosDeImporte(filasModalidad, ETIQUETA_MODALIDAD, MODALIDADES_PAGO),

        porEdad: distribucionPorEdad(demografia, hoy),
        porGenero: distribucionPorGenero(demografia),
        porEdadYGenero: distribucionPorEdadYGenero(demografia, hoy),
        totalAlumnosActivos: activos.length,

        asistencia: {
          asistieron: asistieronDeActivos,
          total: activos.length,
          porcentaje:
            activos.length === 0 ? 0 : Math.round((asistieronDeActivos / activos.length) * 100),
        },
        porFrecuencia,

        cumpleanos: cumpleanosDelMes(cumpleanos, hoy),
      });
    });
  },
);
