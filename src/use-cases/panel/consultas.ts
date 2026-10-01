import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, ok, type Result } from "@/use-cases/_kernel/result";
import {
  contarAlumnosPorVinculo,
  contarMovimientoDelPadron,
  listarCumpleanosDeActivos,
  listarEventosRecientes,
} from "@/data/repositories/students-repo";
import { situacionDeLosActivos } from "@/use-cases/cobertura/situacion-de-activos";
import { cumpleanosDelMes, type AlumnoConCumpleanos } from "@/domain/alumnos/cumpleanos";
import { totalCobrado } from "@/data/repositories/payments-repo";
import { obtenerConfiguracion, obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";
import {
  diasDelMes,
  etiquetaDeMes,
  posicionEnElMes,
  primerDiaDelMes,
  ultimoDiaDelMes,
} from "@/domain/fechas/calendario";
import {
  segmentosDelMes,
  type EstadoDeCobertura,
  type SegmentoDelMes,
} from "@/domain/pagos/cobertura";
import { isDevMockAuthEnabled } from "@/lib/auth/config";

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
  cumpleanos: AlumnoConCumpleanos[];
}

const GRAVEDAD: Record<EstadoDeCobertura, number> = {
  DESCUBIERTO: 0,
  REVISAR: 1,
  CUBIERTO: 2,
  NO_APLICA: 3,
};

export const panelQuery = withAuth<void, Panel>(["DUENO", "STAFF"], async (ctx) => {
  return withTenantTx<Result<Panel>>(ctx, async (tx) => {
    let gym, config;
    try {
      gym = await obtenerGimnasio(tx, ctx);
      config = await obtenerConfiguracion(tx, ctx);
    } catch (err) {
      if (isDevMockAuthEnabled()) {
        gym = null;
        config = null;
      } else {
        throw err;
      }
    }

    if (!gym || !config) {
      if (isDevMockAuthEnabled()) {
        const tz = "America/Argentina/Buenos_Aires";
        const hoy = hoyISO(tz);
        return ok({
          hoy,
          etiquetaMes: etiquetaDeMes(hoy, { conAnio: true }),
          posicionDeHoy: posicionEnElMes(hoy),
          diaDeHoy: Number(hoy.slice(8, 10)),
          diasDelMes: diasDelMes(hoy),
          activos: 39,
          pausados: 3,
          bajas: 6,
          cubiertos: 20,
          enRevision: 7,
          descubiertos: 12,
          movimiento: { nuevos: 3, volvieron: 2, dejaron: 1, pausaron: 1 },
          cobradoEsteMes: { total: 1450000, cantidad: 25 },
          moneda: "ARS",
          atencion: [],
          actividad: [],
          cumpleanos: [],
        });
      }
      return conflict("No pudimos leer la configuración del gimnasio.");
    }

    const hoy = hoyISO(gym.timezone);
    const inicioDelMes = primerDiaDelMes(hoy);
    const finDelMes = ultimoDiaDelMes(hoy);

    const [conteo, movimiento, cobrado, actividad, cumpleanosCrudo] = await Promise.all([
      contarAlumnosPorVinculo(tx, ctx),
      contarMovimientoDelPadron(tx, ctx, { desde: inicioDelMes, hasta: finDelMes }),
      totalCobrado(tx, ctx, { desde: inicioDelMes, hasta: finDelMes }),
      listarEventosRecientes(tx, ctx, 8),
      listarCumpleanosDeActivos(tx, ctx),
    ]);

    const parametros = {
      ventanaPagoHasta: config.ventanaPagoHasta,
      diasGracia: config.diasGracia,
      diasNuevoSinPago: config.diasNuevoSinPago,
    };

    // La misma cuenta que usa Métricas para "al día" (ver
    // use-cases/cobertura/situacion-de-activos.ts): una sola implementación.
    const evaluados = await situacionDeLosActivos(tx, ctx, hoy, parametros);

    let cubiertos = 0;
    let enRevision = 0;
    let descubiertos = 0;
    const atencion: AlumnoEnAtencion[] = [];

    for (const { alumno, situacion, tramos: suyos } of evaluados) {
      if (situacion.estado === "CUBIERTO") cubiertos++;
      else if (situacion.estado === "REVISAR") enRevision++;
      else if (situacion.estado === "DESCUBIERTO") descubiertos++;

      if (situacion.estado === "REVISAR" || situacion.estado === "DESCUBIERTO") {
        atencion.push({
          id: alumno.id,
          nombre: alumno.nombre,
          apellido: alumno.apellido,
          telefono: alumno.telefono,
          planNombre: alumno.planNombre,
          estado: situacion.estado,
          detalle: situacion.detalle,
          // `diasVencido` viene de `situacionDeCobertura()` — nunca pagó
          // (null) ordena como el caso más grave, no como el más leve.
          diasSinCubrir: situacion.diasVencido ?? Number.MAX_SAFE_INTEGER,
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
      cumpleanos: cumpleanosDelMes(cumpleanosCrudo, hoy),
    });
  });
});
