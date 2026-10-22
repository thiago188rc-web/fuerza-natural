import { METODO_SIN_DATO, registrarPagoSchema, type RegistrarPagoRaw } from "@/schemas/payment";
import { withAuth } from "@/use-cases/_kernel/with-auth";
import { parseInput } from "@/use-cases/_kernel/with-validation";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { logActivity } from "@/use-cases/_kernel/with-audit";
import {
  confirmacionRequerida,
  ok,
  validationError,
  type Result,
} from "@/use-cases/_kernel/result";
import {
  buscarCoberturaSuperpuesta,
  obtenerAlumnoParaCobro,
  registrarPago,
} from "@/data/repositories/payments-repo";
import { obtenerPlanActivo } from "@/data/repositories/students-repo";
import { obtenerGimnasio } from "@/data/repositories/gym-repo";
import { coberturaDe, tramosImputados, ETIQUETA_MODALIDAD } from "@/domain/pagos/modalidad";
import { nombreCompleto } from "@/domain/alumnos/identidad";
import { hoyISO } from "@/domain/fechas/hoy";

/**
 * REGISTRAR UN PAGO.
 *
 * Lo que este caso de uso NO hace, y es lo más importante de él:
 *
 *   · No cambia el plan habitual del alumno. Ni siquiera cuando la
 *     modalidad es MEDIO_MES, ni cuando el pago es por otra cantidad de
 *     días que la de su plan (§4bis). Un pago registra una cobertura
 *     comprada; el plan de la persona es otra cosa
 *     (docs/REGLAS-DE-NEGOCIO.md §4).
 *   · No cambia el vínculo. Pagar no reactiva a nadie, y no pagar no da
 *     de baja a nadie. Ninguna transición de estado ocurre sola.
 *   · No calcula "último pago + 30 días". Guarda el período real cubierto,
 *     partido por mes cuando hace falta (§5).
 *   · No inventa precios. El importe llega del formulario, que a su vez lo
 *     autocompletó con el precio configurado; si el dueño lo edita, se
 *     guarda lo que él dijo. El snapshot queda inmutable.
 *
 * Cuando la cobertura pedida se superpone con una que ya existe, devuelve
 * CONFIRMACION_REQUERIDA sin escribir nada. Puede ser legítimo (dos medios
 * meses, un ajuste), así que la decisión es humana — pero informada.
 */

export interface PagoRegistrado {
  id: string;
  studentId: string;
  alumno: string;
  telefono: string | null;
  planNombre: string;
  monto: number;
  cubreDesde: string;
  cubreHasta: string;
  modalidad: string;
}

export interface SuperposicionDeCobertura {
  alumno: string;
  /** Lo que se quiere cubrir ahora. */
  pedido: { desde: string; hasta: string };
  /** Lo que ya estaba cubierto y se pisa. */
  existentes: { desde: string; hasta: string; fechaPago: string; monto: number }[];
}

export const registrarPagoAction = withAuth<
  RegistrarPagoRaw,
  PagoRegistrado,
  SuperposicionDeCobertura
>(["DUENO", "STAFF"], async (ctx, rawInput) => {
  const parsed = parseInput(registrarPagoSchema, rawInput);
  if (!parsed.ok) return parsed.result;
  const input = parsed.data;

  return withTenantTx<Result<PagoRegistrado, SuperposicionDeCobertura>>(ctx, async (tx) => {
    const gym = await obtenerGimnasio(tx, ctx);
    if (!gym) return validationError([{ path: "gymId", message: "Gimnasio no encontrado." }]);

    const hoy = hoyISO(gym.timezone);
    if (input.fechaPago > hoy) {
      return validationError([
        { path: "fechaPago", message: "La fecha del pago no puede ser posterior a hoy." },
      ]);
    }

    const alumno = await obtenerAlumnoParaCobro(tx, ctx, input.studentId);
    if (!alumno) {
      return validationError([{ path: "studentId", message: "El alumno no existe." }]);
    }
    if (alumno.vinculo === "BAJA") {
      return validationError([
        {
          path: "studentId",
          message:
            "Este alumno está dado de baja. Reactivalo desde su ficha antes de registrar un pago.",
        },
      ]);
    }

    // Cuántos días cubre este pago. Por defecto, los del plan habitual;
    // si el dueño eligió otros al cobrar, tiene que ser un plan ACTIVO de
    // este gimnasio, y el nombre y los días salen de la base.
    let plan = { id: alumno.planId, nombre: alumno.planNombre, diasSemana: alumno.planDiasSemana };
    if (input.planId && input.planId !== alumno.planId) {
      const elegido = await obtenerPlanActivo(tx, ctx, input.planId);
      if (!elegido) {
        return validationError([
          { path: "planId", message: "Elegí uno de los planes que ofrece el gimnasio." },
        ]);
      }
      plan = elegido;
    }

    // La cobertura se deriva de la modalidad. Es la única aritmética de
    // fechas del flujo, vive en el dominio y está cubierta por tests.
    const cobertura = coberturaDe(input.modalidad, input.cubreDesde);
    const tramos = tramosImputados(cobertura);

    const superpuestos = await buscarCoberturaSuperpuesta(tx, ctx, input.studentId, cobertura);
    if (superpuestos.length > 0 && !input.confirmarSuperposicion) {
      return confirmacionRequerida({
        alumno: nombreCompleto(alumno.nombre, alumno.apellido),
        pedido: cobertura,
        existentes: superpuestos.map((s) => ({
          desde: s.desde,
          hasta: s.hasta,
          fechaPago: s.fechaPago,
          monto: Number(s.monto),
        })),
      });
    }

    const fila = await registrarPago(
      tx,
      ctx,
      {
        studentId: alumno.id,
        fechaPago: input.fechaPago,
        // El snapshot sale de la base, no del formulario: es la foto del
        // plan de ESTE pago en este momento, y nadie la puede corregir
        // después.
        planId: plan.id,
        planDiasSnapshot: plan.diasSemana,
        planNombreSnapshot: plan.nombre,
        modalidad: input.modalidad,
        monto: input.monto.toFixed(2),
        metodo: METODO_SIN_DATO,
        nota: input.nota ?? null,
        idempotencyKey: input.idempotencyKey,
      },
      tramos,
    );

    const nombre = nombreCompleto(alumno.nombre, alumno.apellido);
    await logActivity(tx, ctx, {
      accion: "payment.created",
      entidad: "payment",
      entidadId: fila.id,
      resumen: `Pago de ${nombre}: ${ETIQUETA_MODALIDAD[input.modalidad]} (${plan.nombre}) del ${cobertura.desde} al ${cobertura.hasta}`,
      cambios: {
        monto: { antes: null, despues: input.monto },
        cobertura: { antes: null, despues: `${cobertura.desde}..${cobertura.hasta}` },
        plan: { antes: null, despues: plan.nombre },
      },
    });

    return ok({
      id: fila.id,
      studentId: alumno.id,
      alumno: nombre,
      telefono: alumno.telefono,
      planNombre: plan.nombre,
      monto: input.monto,
      cubreDesde: cobertura.desde,
      cubreHasta: cobertura.hasta,
      modalidad: input.modalidad,
    });
  });
});
