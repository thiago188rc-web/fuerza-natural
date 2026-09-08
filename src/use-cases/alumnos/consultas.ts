import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { notFound, ok, type Result } from "@/use-cases/_kernel/result";
import {
  contarAlumnosPorVinculo,
  listarAlumnos,
  listarEventosDeAlumno,
  listarPlanesActivos,
  obtenerFichaAlumno,
  type FichaAlumno,
} from "@/data/repositories/students-repo";
import { ESTADO_FILTRO_TODOS, type FiltrosAlumnos } from "@/schemas/student";
import { esVinculo } from "@/domain/alumnos/vinculo";

/**
 * LECTURAS del módulo de alumnos.
 *
 * Pasan por `withAuth()` igual que las escrituras, y por la misma razón:
 * los datos de los alumnos son el activo sensible del sistema, y una
 * lectura sin autorización los filtra igual que una escritura sin
 * autorización los corrompe. Se llaman desde Server Components, nunca
 * desde el navegador.
 *
 * Se llaman `*Query` y no `*Action` para que se lea de un vistazo cuál
 * muta y cuál no — el test de seguridad exige `withAuth()` en las dos
 * familias (tests/security/withAuth-wrapping.test.ts).
 */

export type ListadoAlumnos = Awaited<ReturnType<typeof listarAlumnos>> & {
  conteoPorVinculo: Record<string, number>;
};

export const listarAlumnosQuery = withAuth<FiltrosAlumnos, ListadoAlumnos>(
  ["DUENO", "STAFF"],
  async (ctx, filtros) => {
    return withTenantTx<Result<ListadoAlumnos>>(ctx, async (tx) => {
      const vinculo =
        filtros.estado !== ESTADO_FILTRO_TODOS && esVinculo(filtros.estado) ? filtros.estado : null;

      const [listado, conteoPorVinculo] = await Promise.all([
        listarAlumnos(tx, ctx, { termino: filtros.q ?? null, vinculo, pagina: filtros.pagina }),
        contarAlumnosPorVinculo(tx, ctx),
      ]);

      return ok({ ...listado, conteoPorVinculo });
    });
  },
);

export interface FichaCompleta {
  alumno: FichaAlumno;
  eventos: Awaited<ReturnType<typeof listarEventosDeAlumno>>;
}

export const obtenerFichaAlumnoQuery = withAuth<string, FichaCompleta>(
  ["DUENO", "STAFF"],
  async (ctx, id) => {
    return withTenantTx<Result<FichaCompleta>>(ctx, async (tx) => {
      const alumno = await obtenerFichaAlumno(tx, ctx, id);
      if (!alumno) return notFound();

      const eventos = await listarEventosDeAlumno(tx, ctx, id);
      return ok({ alumno, eventos });
    });
  },
);

export type PlanDisponible = Awaited<ReturnType<typeof listarPlanesActivos>>[number];

/**
 * Los planes y sus precios salen SIEMPRE de la base (`app.plans`, que el
 * dueño configura), nunca de una constante en el código o en la UI. Por
 * eso este código no cambió cuando el dueño confirmó los cinco planes y
 * sus precios: LIBRE aparece en el desplegable porque existe como fila en
 * `plans`, no porque alguien lo haya agregado acá.
 *
 * LIBRE es un plan propio, NO un alias de "5 días": el dueño lo definió
 * como "5 días o más por semana, incluye sábados"
 * (docs/REGLAS-DE-NEGOCIO.md §1). Su precio sigue pendiente de confirmar,
 * y `precioActual` puede venir en null — Fase 2 no debe autocompletar un
 * monto que nadie confirmó.
 */
export const listarPlanesQuery = withAuth<void, PlanDisponible[]>(
  ["DUENO", "STAFF"],
  async (ctx) => {
    return withTenantTx<Result<PlanDisponible[]>>(ctx, async (tx) => {
      return ok(await listarPlanesActivos(tx, ctx));
    });
  },
);
