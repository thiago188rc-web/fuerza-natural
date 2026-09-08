import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, ok, type Result } from "@/use-cases/_kernel/result";
import {
  contarAlumnosPorVinculo,
  contarMovimientoDelPadron,
  listarAlumnosActivosParaCobertura,
  listarEventosRecientes,
} from "@/data/repositories/students-repo";
import { listarTramosCubiertos, totalCobrado } from "@/data/repositories/payments-repo";
import { obtenerConfiguracion, obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";
import {
  diasDelMes,
  etiquetaDeMes,
  posicionEnElMes,
  primerDiaDelMes,
  sumarMeses,
  ultimoDiaDelMes,
} from "@/domain/fechas/calendario";
import {
  segmentosDelMes,
  situacionDeCobertura,
  type EstadoDeCobertura,
  type SegmentoDelMes,
  type TramoCubierto,
} from "@/domain/pagos/cobertura";

/**
 * LA CENTRAL DE OPERACIONES.
 *
 * Una sola transacción arma todo el panel. La situación de pago de cada
 * alumno se DERIVA acá, en el servidor, con las funciones puras del
 * dominio y los parámetros del gimnasio — no hay ninguna columna
 * `moroso`, ni un proceso nocturno, ni un cálculo en el navegador
 * (docs/REGLAS-DE-NEGOCIO.md §6).
 *
 * Se deriva sobre la lista completa de activos y no sobre una consulta
 * agregada en SQL a propósito: la regla ("hoy cae dentro de algún tramo,
 * salvo alta reciente, salvo ventana de pago abierta") vive en un solo
 * lugar y está cubierta por tests. Duplicarla en SQL sería tener dos
 * verdades. Para el tamaño real de un gimnasio —cientos de alumnos, no
 * millones— traer la lista es barato.
 */

export interface AlumnoEnAtencion {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  planNombre: string;
  estado: EstadoDeCobertura;
  detalle: string;
  /** Días sin cobertura. Sirve para ordenar por gravedad real. */
  diasSinCubrir: number;
  segmentos: SegmentoDelMes[];
}

export interface EventoDelPanel {
  id: string;
  tipo: string;
  ocurridoEl: string;
  studentId: string;
  nombre: string;
  apellido: string;
  actorNombre: string;
  createdAt: string;
  datos: Record<string, unknown>;
}

export interface Panel {
  hoy: string;
  etiquetaMes: string;
  /** 0 a 1 — dónde cae hoy dentro del mes. Lo dibuja el instrumento. */
  posicionDeHoy: number;
  diaDeHoy: number;
  diasDelMes: number;
  activos: number;
  pausados: number;
  bajas: number;
  cubiertos: number;
  enRevision: number;
  descubiertos: number;
  movimiento: { nuevos: number; volvieron: number; dejaron: number; pausaron: number };
  cobradoEsteMes: { total: number; cantidad: number };
  moneda: string;
  atencion: AlumnoEnAtencion[];
  actividad: EventoDelPanel[];
}

const GRAVEDAD: Record<EstadoDeCobertura, number> = {
  DESCUBIERTO: 0,
  REVISAR: 1,
  CUBIERTO: 2,
  NO_APLICA: 3,
};

export const panelQuery = withAuth<void, Panel>(["DUENO", "STAFF"], async (ctx) => {
  return withTenantTx<Result<Panel>>(ctx, async (tx) => {
    const gym = await obtenerGimnasio(tx, ctx);
    const config = await obtenerConfiguracion(tx, ctx);
    if (!gym || !config) return conflict("No pudimos leer la configuración del gimnasio.");

    const hoy = hoyISO(gym.timezone);
    const inicioDelMes = primerDiaDelMes(hoy);
    const finDelMes = ultimoDiaDelMes(hoy);

    const [conteo, activos, movimiento, cobrado, actividad] = await Promise.all([
      contarAlumnosPorVinculo(tx, ctx),
      listarAlumnosActivosParaCobertura(tx, ctx),
      contarMovimientoDelPadron(tx, ctx, { desde: inicioDelMes, hasta: finDelMes }),
      totalCobrado(tx, ctx, { desde: inicioDelMes, hasta: finDelMes }),
      listarEventosRecientes(tx, ctx, 8),
    ]);

    // La ventana va MUCHO más atrás que el mes en curso, y no es un
    // exceso: `situacionDeCobertura` necesita el último tramo cubierto para
    // poder decir "sin cobertura hace 40 días". Con una ventana de un mes,
    // alguien que pagó hasta junio no tenía ningún tramo visible y la
    // pantalla lo describía como "nunca registró un pago" — una mentira
    // sobre un alumno que sí pagó.
    //
    // El extremo derecho llega al fin de mes para incluir los tramos que se
    // derraman al mes siguiente (un 1/2 mes que arrancó el 25).
    const tramos = await listarTramosCubiertos(
      tx,
      ctx,
      { desde: primerDiaDelMes(sumarMeses(hoy, -14)), hasta: finDelMes },
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

    let cubiertos = 0;
    let enRevision = 0;
    let descubiertos = 0;
    const atencion: AlumnoEnAtencion[] = [];

    for (const alumno of activos) {
      const suyos = porAlumno.get(alumno.id) ?? [];
      const situacion = situacionDeCobertura(hoy, suyos, parametros, {
        vinculo: alumno.vinculo,
        fechaAltaOriginal: alumno.fechaAltaOriginal,
      });

      if (situacion.estado === "CUBIERTO") cubiertos++;
      else if (situacion.estado === "REVISAR") enRevision++;
      else if (situacion.estado === "DESCUBIERTO") descubiertos++;

      if (situacion.estado === "REVISAR" || situacion.estado === "DESCUBIERTO") {
        const ultimoCubierto = suyos.reduce<string | null>(
          (max, t) => (max === null || t.hasta > max ? t.hasta : max),
          null,
        );
        atencion.push({
          id: alumno.id,
          nombre: alumno.nombre,
          apellido: alumno.apellido,
          telefono: alumno.telefono,
          planNombre: alumno.planNombre,
          estado: situacion.estado,
          detalle: situacion.detalle,
          diasSinCubrir: ultimoCubierto
            ? Math.max(0, Math.round((Date.parse(hoy) - Date.parse(ultimoCubierto)) / 86_400_000))
            : Number.MAX_SAFE_INTEGER,
          segmentos: segmentosDelMes(inicioDelMes, suyos),
        });
      }
    }

    atencion.sort((a, b) => {
      const porEstado = GRAVEDAD[a.estado] - GRAVEDAD[b.estado];
      if (porEstado !== 0) return porEstado;
      if (a.diasSinCubrir !== b.diasSinCubrir) return b.diasSinCubrir - a.diasSinCubrir;
      return a.apellido.localeCompare(b.apellido, "es");
    });

    return ok({
      hoy,
      etiquetaMes: etiquetaDeMes(hoy, { conAnio: true }),
      posicionDeHoy: posicionEnElMes(hoy),
      diaDeHoy: Number(hoy.slice(8, 10)),
      diasDelMes: diasDelMes(hoy),
      activos: conteo.ACTIVO ?? 0,
      pausados: conteo.PAUSADO ?? 0,
      bajas: conteo.BAJA ?? 0,
      cubiertos,
      enRevision,
      descubiertos,
      movimiento,
      cobradoEsteMes: cobrado,
      moneda: gym.moneda,
      atencion,
      actividad: actividad.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        ocurridoEl: e.ocurridoEl,
        studentId: e.studentId,
        nombre: e.nombre,
        apellido: e.apellido,
        actorNombre: e.actorNombre,
        createdAt: e.createdAt.toISOString(),
        datos: (e.datos ?? {}) as Record<string, unknown>,
      })),
    });
  });
});
