import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, ok, type Result } from "@/use-cases/_kernel/result";
import { contarAlumnosPorVinculo, listarAlumnos } from "@/data/repositories/students-repo";
import { listarTramosCubiertos } from "@/data/repositories/payments-repo";
import { obtenerConfiguracion, obtenerGimnasio } from "@/data/repositories/gym-repo";
import { ESTADO_FILTRO_TODOS, type FiltrosAlumnos } from "@/schemas/student";
import { esVinculo } from "@/domain/alumnos/vinculo";
import { hoyISO } from "@/domain/fechas/hoy";
import {
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
 * EL PADRÓN — el listado de alumnos con su situación de pago derivada.
 *
 * Es una consulta aparte de `listarAlumnosQuery` y no un reemplazo: aquella
 * responde "¿quiénes están?", ésta responde "¿quiénes están y cómo vienen?".
 * La diferencia importa porque la segunda cuesta una consulta más de
 * cobertura, y hay pantallas (el selector de plan, por ejemplo) que no la
 * necesitan.
 *
 * La cobertura se pide SOLO para los alumnos de la página visible. Con 25
 * filas por página eso es un `where student_id in (...)` acotado, no un
 * barrido del historial entero.
 */

export interface FilaDelPadron {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  vinculo: string;
  planNombre: string;
  fechaAltaOriginal: string;
  estado: EstadoDeCobertura;
  detalle: string;
  segmentos: SegmentoDelMes[];
}

export interface Padron {
  hoy: string;
  etiquetaMes: string;
  posicionDeHoy: number;
  filas: FilaDelPadron[];
  total: number;
  pagina: number;
  porPagina: number;
  conteoPorVinculo: Record<string, number>;
}

export const padronQuery = withAuth<FiltrosAlumnos, Padron>(
  ["DUENO", "STAFF"],
  async (ctx, filtros) => {
    return withTenantTx<Result<Padron>>(ctx, async (tx) => {
      const gym = await obtenerGimnasio(tx, ctx);
      const config = await obtenerConfiguracion(tx, ctx);
      if (!gym || !config) return conflict("No pudimos leer la configuración del gimnasio.");

      const hoy = hoyISO(gym.timezone);
      const vinculo =
        filtros.estado !== ESTADO_FILTRO_TODOS && esVinculo(filtros.estado) ? filtros.estado : null;

      const [listado, conteoPorVinculo] = await Promise.all([
        listarAlumnos(tx, ctx, { termino: filtros.q ?? null, vinculo, pagina: filtros.pagina }),
        contarAlumnosPorVinculo(tx, ctx),
      ]);

      const inicioDelMes = primerDiaDelMes(hoy);
      // Se traen 14 meses hacia atrás, no solo el mes en curso: la barra
      // dibuja este mes, pero el texto que la acompaña ("sin cobertura hace
      // 40 días") necesita saber cuándo fue la última vez que pagó.
      const tramos = await listarTramosCubiertos(
        tx,
        ctx,
        { desde: primerDiaDelMes(sumarMeses(hoy, -14)), hasta: ultimoDiaDelMes(hoy) },
        listado.filas.map((f) => f.id),
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
        etiquetaMes: etiquetaDeMes(hoy, { conAnio: false }),
        posicionDeHoy: posicionEnElMes(hoy),
        filas: listado.filas.map((f) => {
          const suyos = porAlumno.get(f.id) ?? [];
          const situacion = situacionDeCobertura(hoy, suyos, parametros, {
            vinculo: f.vinculo,
            fechaAltaOriginal: f.fechaAltaOriginal,
          });

          return {
            id: f.id,
            nombre: f.nombre,
            apellido: f.apellido,
            telefono: f.telefono,
            vinculo: f.vinculo,
            planNombre: f.planNombre,
            fechaAltaOriginal: f.fechaAltaOriginal,
            estado: situacion.estado,
            detalle: situacion.detalle,
            segmentos: segmentosDelMes(inicioDelMes, suyos),
          };
        }),
        total: listado.total,
        pagina: listado.pagina,
        porPagina: listado.porPagina,
        conteoPorVinculo,
      });
    });
  },
);
