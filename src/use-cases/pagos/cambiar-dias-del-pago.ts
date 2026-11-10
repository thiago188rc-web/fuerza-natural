import {
  cambiarDiasDelPagoSchema,
  METODO_SIN_DATO,
  type CambiarDiasDelPagoRaw,
} from "@/schemas/payment";
import { withAuth } from "@/use-cases/_kernel/with-auth";
import { parseInput } from "@/use-cases/_kernel/with-validation";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { logActivity } from "@/use-cases/_kernel/with-audit";
import { conflict, notFound, ok, validationError, type Result } from "@/use-cases/_kernel/result";
import { ROLES_QUE_ANULAN_PAGOS } from "@/use-cases/pagos/anular-pago";
import {
  anularPago,
  obtenerPagoParaCorregir,
  registrarPago,
} from "@/data/repositories/payments-repo";
import { obtenerPlanActivo } from "@/data/repositories/students-repo";
import { nombreCompleto } from "@/domain/alumnos/identidad";

/**
 * CAMBIAR LOS DÍAS DE UN PAGO ya cargado: pagó 2 días y se arrepintió, o al
 * revés. El importe se arregla solo con el precio del plan nuevo (o con el
 * que se indique).
 *
 * Un pago no se edita (la base lo impide con un trigger): se corrige como
 * siempre, anulando y registrando de nuevo. Este caso de uso hace las dos
 * cosas en UNA transacción, para que no quede ni el pago viejo contando
 * junto al nuevo, ni la persona sin pago si algo falla a la mitad.
 *
 * El pago nuevo conserva todo lo demás: fecha de cobro, período cubierto,
 * modalidad, nota y forma de pago. Solo cambian los días y el importe.
 * El viejo queda anulado, tachado y con el motivo de cambio a la vista.
 *
 * Quién puede: el mismo rol que anula pagos (hoy, el DUENO), porque
 * anular es parte de esta operación.
 */

export interface PagoConDiasCambiados {
  anuladoId: string;
  nuevoId: string;
  studentId: string;
}

export const cambiarDiasDelPagoAction = withAuth<CambiarDiasDelPagoRaw, PagoConDiasCambiados>(
  ROLES_QUE_ANULAN_PAGOS,
  async (ctx, rawInput) => {
    const parsed = parseInput(cambiarDiasDelPagoSchema, rawInput);
    if (!parsed.ok) return parsed.result;
    const { paymentId, planId, monto: montoIndicado } = parsed.data;

    return withTenantTx<Result<PagoConDiasCambiados>>(ctx, async (tx) => {
      const pago = await obtenerPagoParaCorregir(tx, ctx, paymentId);
      if (!pago) return notFound();
      if (pago.anuladoEn) return conflict("Este pago ya estaba anulado.");
      if (pago.planId === planId) {
        return validationError([
          { path: "planId", message: "Elegí otra cantidad de días: este pago ya está así." },
        ]);
      }
      if (pago.tramos.length === 0) {
        return conflict("Este pago no tiene período registrado, así que no se puede rehacer.");
      }

      const plan = await obtenerPlanActivo(tx, ctx, planId);
      if (!plan) {
        return validationError([
          { path: "planId", message: "Elegí uno de los planes que ofrece el gimnasio." },
        ]);
      }

      const precio = plan.precioActual === null ? null : Number(plan.precioActual);
      const monto = montoIndicado ?? precio;
      if (monto === null) {
        return validationError([
          {
            path: "monto",
            message: `El precio de "${plan.nombre}" todavía no está confirmado. Ingresá el importe.`,
          },
        ]);
      }

      const motivo = `Cambio de días: de ${pago.planNombreSnapshot} a ${plan.nombre}`;
      const anulados = await anularPago(tx, ctx, paymentId, motivo);
      if (anulados.length === 0) return conflict("Este pago ya estaba anulado.");

      const nuevo = await registrarPago(
        tx,
        ctx,
        {
          studentId: pago.studentId,
          fechaPago: pago.fechaPago,
          planId: plan.id,
          planDiasSnapshot: plan.diasSemana,
          planNombreSnapshot: plan.nombre,
          modalidad: pago.modalidad,
          monto: monto.toFixed(2),
          metodo: pago.metodo || METODO_SIN_DATO,
          nota: pago.nota,
          // La clave de idempotencia es del envío original; este es otro.
          idempotencyKey: null,
        },
        pago.tramos,
      );

      const alumno = nombreCompleto(pago.nombre, pago.apellido);
      const antes = Number(pago.monto).toLocaleString("es-AR");
      const despues = monto.toLocaleString("es-AR");
      await logActivity(tx, ctx, {
        accion: "payment.plan_changed",
        entidad: "payment",
        entidadId: nuevo.id,
        resumen: `Pago de ${alumno} del ${pago.fechaPago} rehecho: de ${pago.planNombreSnapshot} a ${plan.nombre}, de $${antes} a $${despues}`,
        cambios: {
          plan: { antes: pago.planNombreSnapshot, despues: plan.nombre },
          monto: { antes: Number(pago.monto), despues: monto },
          pagoAnterior: { antes: paymentId, despues: nuevo.id },
        },
      });

      return ok({ anuladoId: paymentId, nuevoId: nuevo.id, studentId: pago.studentId });
    });
  },
);
