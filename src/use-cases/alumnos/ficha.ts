import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, notFound, ok, type Result } from "@/use-cases/_kernel/result";
import {
  listarEventosDeAlumno,
  obtenerFichaAlumno,
  type FichaAlumno,
} from "@/data/repositories/students-repo";
import { listarPagosDeAlumno, listarTramosDeAlumno } from "@/data/repositories/payments-repo";
import { obtenerConfiguracion, obtenerGimnasio } from "@/data/repositories/gym-repo";
import { hoyISO } from "@/domain/fechas/hoy";
import {
  claveDeMes,
  primerDiaDelMes,
  posicionEnElMes,
  sumarMeses,
} from "@/domain/fechas/calendario";
import {
  segmentosDelMes,
  situacionDeCobertura,
  type EstadoDeCobertura,
  type SegmentoDelMes,
  type TramoCubierto,
} from "@/domain/pagos/cobertura";

/**
 * LA FICHA COMPLETA — todo lo que hace falta para el espacio de trabajo de
 * un alumno, en una sola transacción.
 *
 * Incluye una cosa que ninguna otra pantalla arma: la TIRA DE MESES, doce
 * rieles consecutivos con la cobertura real de cada uno. Es la historia de
 * pago de la persona vista de un vistazo — quién viene pagando parejo,
 * quién tiene huecos, quién arrancó hace tres meses. Un listado de pagos
 * ordenado por fecha tiene la misma información y no la muestra.
 */

export interface MesDeLaTira {
  /** 'YYYY-MM-01' */
  mes: string;
  clave: string;
  /** Inicial del mes, para el eje: E F M A M J J A S O N D. */
  inicial: string;
  segmentos: SegmentoDelMes[];
  esElMesActual: boolean;
  /** Cuántos días del mes quedaron cubiertos. 0 a 31. */
  diasCubiertos: number;
}

export interface PagoDeLaFicha {
  id: string;
  fechaPago: string;
  monto: number;
  metodo: string;
  modalidad: string;
  planNombreSnapshot: string;
  nota: string | null;
  anulado: boolean;
  anuladoMotivo: string | null;
  registradoPorNombre: string;
  cubreDesde: string | null;
  cubreHasta: string | null;
}

export interface FichaCompleta {
  hoy: string;
  moneda: string;
  posicionDeHoy: number;
  alumno: FichaAlumno;
  estado: EstadoDeCobertura;
  detalle: string;
  cubiertoHasta: string | null;
  tira: MesDeLaTira[];
  pagos: PagoDeLaFicha[];
  totalPagado: number;
  eventos: Awaited<ReturnType<typeof listarEventosDeAlumno>>;
}

/** Cuántos meses de historia muestra la tira. */
const MESES_DE_LA_TIRA = 12;

export const fichaCompletaQuery = withAuth<string, FichaCompleta>(
  ["DUENO", "STAFF"],
  async (ctx, id) => {
    return withTenantTx<Result<FichaCompleta>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      const config = await obtenerConfiguracion(tx, ctx);
      if (!gym || !config) return conflict("No pudimos leer la configuración del gimnasio.");

      const alumno = await obtenerFichaAlumno(tx, ctx, id);
      if (!alumno) return notFound();

      const hoy = hoyISO(gym.timezone);
      const [filas, pagos, eventos] = await Promise.all([
        listarTramosDeAlumno(tx, ctx, id),
        listarPagosDeAlumno(tx, ctx, id),
        listarEventosDeAlumno(tx, ctx, id, 30),
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

      const mesActual = primerDiaDelMes(hoy);
      const tira: MesDeLaTira[] = [];
      for (let i = MESES_DE_LA_TIRA - 1; i >= 0; i--) {
        const mes = primerDiaDelMes(sumarMeses(mesActual, -i));
        const segmentos = segmentosDelMes(mes, tramos);
        tira.push({
          mes,
          clave: claveDeMes(mes),
          inicial: INICIALES_DE_MES[Number(mes.slice(5, 7)) - 1],
          segmentos,
          esElMesActual: mes === mesActual,
          diasCubiertos: Math.round(
            segmentos.reduce((total, s) => total + (s.fin - s.inicio), 0) * 30,
          ),
        });
      }

      // Solo los pagos vigentes suman. Un pago anulado sigue estando en la
      // lista —el historial no se reescribe— pero no cuenta como plata
      // cobrada.
      const totalPagado = pagos
        .filter((p) => p.anuladoEn === null)
        .reduce((total, p) => total + Number(p.monto), 0);

      return ok({
        hoy,
        moneda: gym.moneda,
        posicionDeHoy: posicionEnElMes(hoy),
        alumno,
        estado: situacion.estado,
        detalle: situacion.detalle,
        cubiertoHasta: situacion.cubiertoHasta,
        tira,
        pagos: pagos.map((p) => ({
          id: p.id,
          fechaPago: p.fechaPago,
          monto: Number(p.monto),
          metodo: p.metodo,
          modalidad: p.modalidad,
          planNombreSnapshot: p.planNombreSnapshot,
          nota: p.nota,
          anulado: p.anuladoEn !== null,
          anuladoMotivo: p.anuladoMotivo,
          registradoPorNombre: p.registradoPorNombre,
          cubreDesde: p.cubreDesde,
          cubreHasta: p.cubreHasta,
        })),
        totalPagado,
        eventos,
      });
    });
  },
);

const INICIALES_DE_MES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
