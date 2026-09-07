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
 * dueño configura), nunca de una constante en el código o en la UI. Y por
 * eso mismo acá no aparece "LIBRE": el Data Discovery lo encontró en los
 * datos reales, pero si equivale a 5 días o es otra cosa lo decide el
 * dueño en Configuración, no este código.
 */
export const listarPlanesQuery = withAuth<void, PlanDisponible[]>(
  ["DUENO", "STAFF"],
  async (ctx) => {
    return withTenantTx<Result<PlanDisponible[]>>(ctx, async (tx) => {
      return ok(await listarPlanesActivos(tx, ctx));
    });
  },
);
