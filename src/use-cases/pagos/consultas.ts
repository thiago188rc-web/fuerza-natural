import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, notFound, ok, type Result } from "@/use-cases/_kernel/result";
import {
  listarPagos,
  listarTramosCubiertos,
  listarTramosDeAlumno,
  obtenerAlumnoParaCobro,
  totalCobrado,
  type FiltrosDePagos,
} from "@/data/repositories/payments-repo";
import { listarAlumnosActivosParaCobertura } from "@/data/repositories/students-repo";
import { obtenerConfiguracion, obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";
import {
  primerDiaDelMes,
  sumarDias,
  sumarMeses,
  ultimoDiaDelMes,
} from "@/domain/fechas/calendario";
import {
  situacionDeCobertura,
  type EstadoDeCobertura,
  type TramoCubierto,
} from "@/domain/pagos/cobertura";

/**
 * Las consultas del módulo de pagos. Ninguna guarda ni devuelve un estado
 * persistido de "moroso": la situación se deriva en cada lectura con las
 * funciones puras del dominio y los parámetros del gimnasio.
 */

export interface AlumnoParaCobrar {
  id: string;
  nombre: string;
  apellido: string;
  planNombre: string;
  estado: EstadoDeCobertura;
  detalle: string;
  cubiertoHasta: string | null;
}

export interface CarteraDeCobro {
  hoy: string;
  alumnos: AlumnoParaCobrar[];
}

/** El buscador del flujo de cobro: todos los activos con su situación. */
export const carteraDeCobroQuery = withAuth<void, CarteraDeCobro>(
  ["DUENO", "STAFF"],
  async (ctx) => {
    return withTenantTx<Result<CarteraDeCobro>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      const config = await obtenerConfiguracion(tx, ctx);
      if (!gym || !config) return conflict("No pudimos leer la configuración del gimnasio.");

      const hoy = hoyISO(gym.timezone);
      const activos = await listarAlumnosActivosParaCobertura(tx, ctx);
      // Hacia atrás lo suficiente para saber desde cuándo alguien está sin
      // cubrir; hacia adelante, para no perder los pagos adelantados.
      const tramos = await listarTramosCubiertos(
        tx,
        ctx,
        { desde: primerDiaDelMes(sumarMeses(hoy, -14)), hasta: sumarDias(hoy, 400) },
        activos.map((a) => a.id),
      );

      const porAlumno = new Map<string, TramoCubierto[]>();
      for (const t of tramos) {
        const lista = porAlumno.get(t.studentId);
        if (lista) lista.push({ desde: t.desde, hasta: t.hasta });
        else porAlumno.set(t.studentId, [{ desde: t.desde, hasta: t.hasta }]);
      }

      const parametros = {
        ventanaPagoHasta: config.ventanaPagoHasta,
        diasGracia: config.diasGracia,
        diasNuevoSinPago: config.diasNuevoSinPago,
      };

      return ok({
        hoy,
        alumnos: activos.map((a) => {
          const situacion = situacionDeCobertura(hoy, porAlumno.get(a.id) ?? [], parametros, {
            vinculo: a.vinculo,
            fechaAltaOriginal: a.fechaAltaOriginal,
          });
          return {
            id: a.id,
            nombre: a.nombre,
            apellido: a.apellido,
            planNombre: a.planNombre,
            estado: situacion.estado,
            detalle: situacion.detalle,
            cubiertoHasta: situacion.cubiertoHasta,
          };
        }),
      });
    });
  },
);

export interface ContextoDeCobro {
  hoy: string;
  moneda: string;
  alumno: {
    id: string;
    nombre: string;
    apellido: string;
    vinculo: string;
    planId: string;
    planNombre: string;
    planDiasSemana: number;
    planAcceso: string;
    /** `null` = el dueño todavía no confirmó el precio de este plan. */
    planPrecio: number | null;
  };
  /** `null` = precio de 1/2 mes sin confirmar. La UI no puede inventarlo. */
  precioMedioMes: number | null;
  estado: EstadoDeCobertura;
  detalle: string;
  cubiertoHasta: string | null;
  tramos: TramoCubierto[];
  /**
   * Desde cuándo proponer la cobertura. Es un DEFAULT de interfaz, no una
   * regla: si el alumno ya tiene cubierto hasta el 30 de septiembre, el
   * formulario abre en octubre. El dueño lo puede cambiar siempre.
   */
  sugerenciaDesde: string;
}

export const contextoDeCobroQuery = withAuth<string, ContextoDeCobro>(
  ["DUENO", "STAFF"],
  async (ctx, studentId) => {
    return withTenantTx<Result<ContextoDeCobro>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      const config = await obtenerConfiguracion(tx, ctx);
      if (!gym || !config) return conflict("No pudimos leer la configuración del gimnasio.");

      const alumno = await obtenerAlumnoParaCobro(tx, ctx, studentId);
      if (!alumno) return notFound();

      const hoy = hoyISO(gym.timezone);
      const filas = await listarTramosDeAlumno(tx, ctx, studentId);
      const tramos: TramoCubierto[] = filas.map((f) => ({ desde: f.desde, hasta: f.hasta }));

      const situacion = situacionDeCobertura(
        hoy,
        tramos,
        {
          ventanaPagoHasta: config.ventanaPagoHasta,
          diasGracia: config.diasGracia,
          diasNuevoSinPago: config.diasNuevoSinPago,
        },
        { vinculo: alumno.vinculo, fechaAltaOriginal: alumno.fechaAltaOriginal },
      );

      const ultimoCubierto = tramos.reduce<string | null>(
        (max, t) => (max === null || t.hasta > max ? t.hasta : max),
        null,
      );
      const sugerenciaDesde =
        ultimoCubierto && ultimoCubierto >= hoy
          ? primerDiaDelMes(sumarMeses(ultimoCubierto, 1))
          : primerDiaDelMes(hoy);

      return ok({
        hoy,
        moneda: gym.moneda,
        alumno: {
          id: alumno.id,
          nombre: alumno.nombre,
          apellido: alumno.apellido,
          vinculo: alumno.vinculo,
          planId: alumno.planId,
          planNombre: alumno.planNombre,
          planDiasSemana: alumno.planDiasSemana,
          planAcceso: alumno.planAcceso,
          planPrecio: alumno.planPrecio === null ? null : Number(alumno.planPrecio),
        },
        precioMedioMes: config.precioMedioMes === null ? null : Number(config.precioMedioMes),
        estado: situacion.estado,
        detalle: situacion.detalle,
        cubiertoHasta: situacion.cubiertoHasta,
        tramos,
        sugerenciaDesde,
      });
    });
  },
);

export interface PagoDelHistorial {
  id: string;
  fechaPago: string;
  monto: number;
  metodo: string;
  modalidad: string;
  planNombreSnapshot: string;
  nota: string | null;
  anulado: boolean;
  anuladoMotivo: string | null;
  studentId: string;
  nombre: string;
  apellido: string;
  registradoPorNombre: string;
  cubreDesde: string | null;
  cubreHasta: string | null;
}

export interface HistorialDePagos {
  hoy: string;
  moneda: string;
  filas: PagoDelHistorial[];
  total: number;
  pagina: number;
  porPagina: number;
  /** Lo cobrado en el rango consultado, no en el mes calendario. */
  cobradoEnElRango: { total: number; cantidad: number };
  rango: { desde: string; hasta: string };
}

export const historialDePagosQuery = withAuth<Partial<FiltrosDePagos>, HistorialDePagos>(
  ["DUENO", "STAFF"],
  async (ctx, filtros) => {
    return withTenantTx<Result<HistorialDePagos>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      if (!gym) return conflict("No pudimos leer la configuración del gimnasio.");

      const hoy = hoyISO(gym.timezone);
      const desde = filtros?.desde ?? primerDiaDelMes(hoy);
      const hasta = filtros?.hasta ?? ultimoDiaDelMes(hoy);
      const pagina = Math.max(1, filtros?.pagina ?? 1);

      const [listado, cobrado] = await Promise.all([
        listarPagos(tx, ctx, { desde, hasta, pagina }),
        totalCobrado(tx, ctx, { desde, hasta }),
      ]);

      return ok({
        hoy,
        moneda: gym.moneda,
        filas: listado.filas.map((f) => ({
          id: f.id,
          fechaPago: f.fechaPago,
          monto: Number(f.monto),
          metodo: f.metodo,
          modalidad: f.modalidad,
          planNombreSnapshot: f.planNombreSnapshot,
          nota: f.nota,
          anulado: f.anuladoEn !== null,
          anuladoMotivo: f.anuladoMotivo,
          studentId: f.studentId,
          nombre: f.nombre,
          apellido: f.apellido,
          registradoPorNombre: f.registradoPorNombre,
          cubreDesde: f.cubreDesde,
          cubreHasta: f.cubreHasta,
        })),
        total: listado.total,
        pagina: listado.pagina,
        porPagina: listado.porPagina,
        cobradoEnElRango: cobrado,
        rango: { desde, hasta },
      });
    });
  },
);
