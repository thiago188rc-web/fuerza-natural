import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { conflict, ok, type Result } from "@/use-cases/_kernel/result";
import {
  ALUMNOS_POR_PAGINA,
  contarAlumnosPorVinculo,
  listarAlumnosParaPadron,
} from "@/data/repositories/students-repo";
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
  compararPorUrgencia,
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
 * La cobertura se calcula para TODOS los que coinciden con el filtro, no
 * solo para la página visible: el orden por vencimiento dentro de los
 * activos depende de esa cobertura, y recién se puede cortar la página
 * una vez que todos están ordenados (`listarAlumnosParaPadron` trae el
 * listado completo a propósito, ver su comentario).
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
  /** Último día cubierto, si está `CUBIERTO`. Para la columna de pago. */
  cubiertoHasta: string | null;
  /** Días vencido, para el color amarillo/rojo y el texto de la columna. */
  diasVencido: number | null;
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

      const [todos, conteoPorVinculo] = await Promise.all([
        listarAlumnosParaPadron(tx, ctx, { termino: filtros.q ?? null, vinculo }),
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
        todos.map((f) => f.id),
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

      // La cobertura se calcula para TODOS antes de ordenar: el orden por
      // vencimiento depende de ella, y no se puede ordenar lo que todavía
      // no se calculó.
      const filasConSituacion = todos.map((f) => {
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
          situacion,
          segmentos: segmentosDelMes(inicioDelMes, suyos),
        };
      });

      const RANGO_VINCULO: Record<string, number> = { ACTIVO: 0, PAUSADO: 1, BAJA: 2 };
      filasConSituacion.sort((a, b) => {
        const diferenciaDeVinculo = RANGO_VINCULO[a.vinculo] - RANGO_VINCULO[b.vinculo];
        if (diferenciaDeVinculo !== 0) return diferenciaDeVinculo;

        // Por vencimiento solo entre los activos: a un pausado o de baja
        // no se le reclama nada, así que ordenarlo por apellido es lo que
        // de verdad ayuda a encontrarlo.
        // Mismo vencimiento → por apellido, para que el orden no cambie de
        // una carga a otra.
        const porVencimiento =
          a.vinculo === "ACTIVO" ? compararPorUrgencia(a.situacion, b.situacion) : 0;

        return (
          porVencimiento || a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre)
        );
      });

      const total = filasConSituacion.length;
      const pagina = Math.max(1, filtros.pagina);
      const desdeIndice = (pagina - 1) * ALUMNOS_POR_PAGINA;
      const filasDeLaPagina = filasConSituacion.slice(desdeIndice, desdeIndice + ALUMNOS_POR_PAGINA);

      return ok({
        hoy,
        etiquetaMes: etiquetaDeMes(hoy, { conAnio: false }),
        posicionDeHoy: posicionEnElMes(hoy),
        filas: filasDeLaPagina.map((f) => ({
          id: f.id,
          nombre: f.nombre,
          apellido: f.apellido,
          telefono: f.telefono,
          vinculo: f.vinculo,
          planNombre: f.planNombre,
          fechaAltaOriginal: f.fechaAltaOriginal,
          estado: f.situacion.estado,
          detalle: f.situacion.detalle,
          cubiertoHasta: f.situacion.cubiertoHasta,
          diasVencido: f.situacion.diasVencido,
          segmentos: f.segmentos,
        })),
        total,
        pagina,
        porPagina: ALUMNOS_POR_PAGINA,
        conteoPorVinculo,
      });
    });
  },
);
