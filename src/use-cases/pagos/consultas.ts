import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, notFound, ok, type Result } from "@/use-cases/_kernel/result";
import {
  listarPagos,
  listarPagosAnulados,
  listarTramosCubiertos,
  listarTramosDeAlumno,
  obtenerAlumnoParaCobro,
  totalAnulado,
  totalCobrado,
  type FiltrosDePagos,
} from "@/data/repositories/payments-repo";
import {
  listarAlumnosActivosParaCobertura,
  listarPlanesActivos,
  marcasDeMovimientoPorAlumno,
} from "@/data/repositories/students-repo";
import { obtenerConfiguracion, obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";
import { puedeAnularPagos } from "@/use-cases/pagos/anular-pago";
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
    telefono: string | null;
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
   * Desde cuándo corre la cobertura: el día después del último cubierto,
   * o la fecha de alta si todavía no pagó nunca. Ya no es editable desde
   * el formulario de cobro — el dueño pidió que la única fecha que se
   * carga a mano sea la del pago.
   */
  sugerenciaDesde: string;
  /** Los planes activos con su precio, para los atajos de importe al cobrar. */
  planesActivos: { id: string; nombre: string; precio: number | null }[];
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
      const [filas, planes] = await Promise.all([
        listarTramosDeAlumno(tx, ctx, studentId),
        listarPlanesActivos(tx, ctx),
      ]);
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
      // El día después del último cubierto, SIN normalizar al día 1 ni
      // reiniciar al día de hoy aunque haya un hueco: el ciclo mensual
      // queda anclado al mismo número de día siempre (confirmado por
      // Diego — 2026-10-08/09, ver `coberturaDe`). El primer pago de
      // todos (sin cobertura previa) ancla al día real de alta — "se
      // identifica desde el primer día que ingresó la persona" — y no al
      // día en que se hace ese primer pago, que puede ser más tarde.
      const sugerenciaDesde = ultimoCubierto ? sumarDias(ultimoCubierto, 1) : alumno.fechaAltaOriginal;

      return ok({
        hoy,
        moneda: gym.moneda,
        alumno: {
          id: alumno.id,
          nombre: alumno.nombre,
          apellido: alumno.apellido,
          telefono: alumno.telefono,
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
        planesActivos: planes.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          precio: p.precioActual === null ? null : Number(p.precioActual),
        })),
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
  telefono: string | null;
  registradoPorNombre: string;
  cubreDesde: string | null;
  cubreHasta: string | null;
  /** Si el alumno tuvo un ALTA o una REACTIVACION en el mismo rango que este listado. */
  marca: "NUEVO" | "VOLVIO" | null;
}

export interface AnuladoDelHistorial {
  id: string;
  studentId: string;
  nombre: string;
  apellido: string;
  fechaPago: string;
  monto: number;
  /** Cuándo se hizo la anulación (no la fecha del pago). */
  anuladoEn: string;
  anuladoMotivo: string | null;
  anuladoPorNombre: string;
}

export interface HistorialDePagos {
  hoy: string;
  moneda: string;
  filas: PagoDelHistorial[];
  total: number;
  /** Lo cobrado en el rango consultado, no en el mes calendario. */
  cobradoEnElRango: { total: number; cantidad: number };
  /** Lo anulado en el rango consultado — ya excluido de `cobradoEnElRango`. */
  anuladoEnElRango: { total: number; cantidad: number };
  /** El detalle de cada uno: quién, cuándo se cobró, cuándo y por quién se anuló. */
  anulados: AnuladoDelHistorial[];
  rango: { desde: string; hasta: string };
  /** Si la sesión puede anular pagos (hoy, solo el DUENO). */
  puedeAnularPagos: boolean;
  ordenarPor: "fecha" | "nombre";
  direccion: "asc" | "desc";
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
      const ordenarPor = filtros?.ordenarPor ?? "fecha";
      // Del día 1 al último del mes, en ese orden, no al revés.
      const direccion = filtros?.direccion ?? "asc";

      const [listado, cobrado, anulado, anulados, marcas] = await Promise.all([
        listarPagos(tx, ctx, { desde, hasta, ordenarPor, direccion }),
        totalCobrado(tx, ctx, { desde, hasta }),
        totalAnulado(tx, ctx, { desde, hasta }),
        listarPagosAnulados(tx, ctx, { desde, hasta }),
        marcasDeMovimientoPorAlumno(tx, ctx, { desde, hasta }),
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
          telefono: f.telefono,
          registradoPorNombre: f.registradoPorNombre,
          cubreDesde: f.cubreDesde,
          cubreHasta: f.cubreHasta,
          marca:
            marcas.get(f.studentId) === "ALTA"
              ? "NUEVO"
              : marcas.get(f.studentId) === "REACTIVACION"
                ? "VOLVIO"
                : null,
        })),
        total: listado.total,
        cobradoEnElRango: cobrado,
        anuladoEnElRango: anulado,
        anulados: anulados.map((a) => ({
          id: a.id,
          studentId: a.studentId,
          nombre: a.nombre,
          apellido: a.apellido,
          fechaPago: a.fechaPago,
          monto: Number(a.monto),
          // El `where anulado_en is not null` de la query lo garantiza.
          anuladoEn: a.anuladoEn!.toISOString(),
          anuladoMotivo: a.anuladoMotivo,
          anuladoPorNombre: a.anuladoPorNombre,
        })),
        rango: { desde, hasta },
        puedeAnularPagos: puedeAnularPagos(ctx.rol),
        ordenarPor,
        direccion,
      });
    });
  },
);
