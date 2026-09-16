import { withAuth } from "@/use-cases/_kernel/with-auth";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { ok, validationError, type Result } from "@/use-cases/_kernel/result";
import { listarPagosDelPeriodo, totalCobrado } from "@/data/repositories/payments-repo";
import { ultimoDiaDelMes, sumarDias, sumarMeses } from "@/domain/fechas/calendario";

/**
 * QUIÉN PAGÓ en una barra puntual del gráfico de tendencia de Métricas.
 *
 * Recibe el mismo `periodo` que ya trae cada `PuntoDeFacturacion`
 * (el primer día del bucket) y reconstruye el rango exacto que esa barra
 * resume — un día, una semana o un mes — en vez de que la pantalla tenga
 * que mandar el rango ya calculado. Así el cálculo del rango vive en un
 * solo lugar (acá y en `configDeVista`), no duplicado en el cliente.
 *
 * Solo para barras de un día (vistas semana/mes) suma, además, cuánto se
 * facturó el MISMO número de día del mes anterior — no "el mes anterior
 * entero", que ya está en `comparacionMensual`, sino el punto exacto de
 * comparación que pidió el dueño ("cuánto llevaba a esta altura el mes
 * pasado"). `sumarMeses` ya resuelve el corrimiento de calendario (31 de
 * marzo → 28/29 de febrero), así que no hay aritmética nueva que inventar
 * acá.
 */

export interface PagoDelPeriodoInput {
  periodo: string;
  granularidad: "dia" | "semana" | "mes";
}

export interface AlumnoQuePago {
  studentId: string;
  nombre: string;
  apellido: string;
  monto: number;
  metodo: string;
  planNombreSnapshot: string;
}

export interface ComparacionMismoDia {
  fecha: string;
  total: number;
  cantidad: number;
}

export interface DetalleDelPeriodo {
  pagos: AlumnoQuePago[];
  /** Null en buckets de semana o mes: "mismo día del mes anterior" solo tiene sentido para un día puntual. */
  comparacionMesAnterior: ComparacionMismoDia | null;
}

function rangoDelBucket(input: PagoDelPeriodoInput): { desde: string; hasta: string } {
  if (input.granularidad === "mes") {
    return { desde: input.periodo, hasta: ultimoDiaDelMes(input.periodo) };
  }
  if (input.granularidad === "semana") {
    return { desde: input.periodo, hasta: sumarDias(input.periodo, 6) };
  }
  return { desde: input.periodo, hasta: input.periodo };
}

export const pagosDelPeriodoQuery = withAuth<PagoDelPeriodoInput, DetalleDelPeriodo>(
  ["DUENO", "STAFF"],
  async (ctx, input) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodo)) {
      return validationError([{ path: "periodo", message: "Fecha inválida." }]);
    }

    return withTenantTx<Result<DetalleDelPeriodo>>(ctx, async (tx) => {
      const rango = rangoDelBucket(input);

      const fechaComparacion = input.granularidad === "dia" ? sumarMeses(input.periodo, -1) : null;

      const [pagos, comparacion] = await Promise.all([
        listarPagosDelPeriodo(tx, ctx, rango),
        fechaComparacion
          ? totalCobrado(tx, ctx, { desde: fechaComparacion, hasta: fechaComparacion })
          : Promise.resolve(null),
      ]);

      return ok({
        pagos: pagos.map((p) => ({
          studentId: p.studentId,
          nombre: p.nombre,
          apellido: p.apellido,
          monto: p.monto,
          metodo: p.metodo,
          planNombreSnapshot: p.planNombreSnapshot,
        })),
        comparacionMesAnterior:
          fechaComparacion && comparacion
            ? { fecha: fechaComparacion, total: comparacion.total, cantidad: comparacion.cantidad }
            : null,
      });
    });
  },
);
