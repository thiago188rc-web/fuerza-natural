import { anularPagoSchema, type AnularPagoRaw } from "@/schemas/payment";
import type { Rol } from "@/lib/auth/context";
import { withAuth } from "@/use-cases/_kernel/with-auth";
import { parseInput } from "@/use-cases/_kernel/with-validation";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { logActivity } from "@/use-cases/_kernel/with-audit";
import { conflict, notFound, ok, type Result } from "@/use-cases/_kernel/result";
import { anularPago, obtenerPagoParaAnular } from "@/data/repositories/payments-repo";
import { nombreCompleto } from "@/domain/alumnos/identidad";

/**
 * ANULAR UN PAGO cargado por error.
 *
 * Lo que hace: marca el pago con fecha, autor y motivo, y lo deja afuera
 * de toda cuenta (cobertura, lo cobrado, métricas: todas las consultas
 * filtran `anulado_en is null`). Lo que NO hace: borrarlo, editarlo ni
 * esconderlo. Queda en el historial, tachado y con su motivo, y la
 * anulación queda en la actividad con quién la hizo.
 *
 * Quién puede: solo el DUENO. No hay una regla escrita del gimnasio sobre
 * esto, y es la opción más restrictiva del modelo de roles actual — la
 * misma que configuración e importación. Si el dueño quiere que su
 * personal también pueda, es agregar "STAFF" acá (decisión pendiente,
 * docs/DECISIONES.md).
 *
 * Doble envío: la actualización solo afecta pagos todavía vigentes, así
 * que el segundo clic (o dos pantallas a la vez) recibe "ya estaba
 * anulado" en lugar de pisar el motivo original.
 */

export const ROLES_QUE_ANULAN_PAGOS: readonly Rol[] = ["DUENO"];

export function puedeAnularPagos(rol: Rol): boolean {
  return ROLES_QUE_ANULAN_PAGOS.includes(rol);
}

export interface PagoAnulado {
  id: string;
  studentId: string;
}

export const anularPagoAction = withAuth<AnularPagoRaw, PagoAnulado>(
  ROLES_QUE_ANULAN_PAGOS,
  async (ctx, rawInput) => {
    const parsed = parseInput(anularPagoSchema, rawInput);
    if (!parsed.ok) return parsed.result;
    const { paymentId, motivo } = parsed.data;

    return withTenantTx<Result<PagoAnulado>>(ctx, async (tx) => {
      const pago = await obtenerPagoParaAnular(tx, ctx, paymentId);
      if (!pago) return notFound();
      if (pago.anuladoEn) return conflict("Este pago ya estaba anulado.");

      const filas = await anularPago(tx, ctx, paymentId, motivo);
      if (filas.length === 0) return conflict("Este pago ya estaba anulado.");

      const alumno = nombreCompleto(pago.nombre, pago.apellido);
      const importe = Number(pago.monto).toLocaleString("es-AR");
      await logActivity(tx, ctx, {
        accion: "payment.annulled",
        entidad: "payment",
        entidadId: paymentId,
        resumen: `Pago anulado de ${alumno}: $${importe} del ${pago.fechaPago}. Motivo: ${motivo}`,
        cambios: {
          anulado: { antes: false, despues: true },
          motivo: { antes: null, despues: motivo },
        },
      });

      return ok({ id: paymentId, studentId: pago.studentId });
    });
  },
);
