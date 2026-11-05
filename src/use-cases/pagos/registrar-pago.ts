import { METODO_SIN_DATO, registrarPagoSchema, type RegistrarPagoRaw } from "@/schemas/payment";
import { withAuth } from "@/use-cases/_kernel/with-auth";
import { parseInput } from "@/use-cases/_kernel/with-validation";
import { withTenantTx } from "@/use-cases/_kernel/with-tenant-tx";
import { logActivity } from "@/use-cases/_kernel/with-audit";
import {
  confirmacionRequerida,
  conflict,
  ok,
  validationError,
  type Result,
} from "@/use-cases/_kernel/result";
import {
  buscarCoberturaSuperpuesta,
  existePagoConClave,
  obtenerAlumnoParaCobro,
  pagosVigentesDelDia,
  registrarPago,
} from "@/data/repositories/payments-repo";
import { obtenerPlanActivo } from "@/data/repositories/students-repo";
import { obtenerGimnasio } from "@/data/repositories/gym-repo";
import {
  coberturaDe,
  tramosImputados,
  ETIQUETA_MODALIDAD,
  type Cobertura,
} from "@/domain/pagos/modalidad";
import { MESES_DE_MARGEN, inicioFueraDeMargen, mesesEncadenados } from "@/domain/pagos/periodos";
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
 *   · No confunde cuándo se cobró con qué se paga. `fechaPago` es cuándo
 *     entró la plata (nunca futura); `cubreDesde` + `meses` es el período
 *     imputado, que puede ser atrasado, el que corre o adelantado
 *     (docs/REGLAS-DE-NEGOCIO.md §5bis).
 *
 * Varios meses juntos son VARIOS PAGOS, uno por mes, en la misma
 * transacción: cada uno con su período, su importe y anulable por
 * separado — exactamente lo que habría quedado cobrándolos de a uno. La
 * clave de idempotencia va en el primero; si el mismo envío llega dos
 * veces, el primer INSERT choca y no entra ninguno.
 *
 * Devuelve CONFIRMACION_REQUERIDA, sin escribir nada, cuando lo pedido se
 * superpone con una cobertura que ya existe o cuando el alumno ya tiene
 * otro pago con la misma fecha de cobro (el pago doble que NO se
 * superpone, porque el segundo cae solo en el mes siguiente). Las dos
 * cosas pueden ser legítimas, así que la decisión es humana — pero
 * informada.
 */

export interface PagoRegistrado {
  /** El id del primer pago (el único, si es un mes). */
  id: string;
  /** Un id por mes cobrado, en orden. */
  ids: string[];
  studentId: string;
  alumno: string;
  telefono: string | null;
  planNombre: string;
  /** El importe de CADA mes. */
  monto: number;
  /** `monto × meses`: lo que entró en caja. */
  total: number;
  meses: number;
  fechaPago: string;
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
  /** Otros pagos vigentes del alumno con la misma fecha de cobro. */
  mismoDia: { fechaPago: string; monto: number; desde: string | null; hasta: string | null }[];
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
    // La fecha de cobro es un hecho: la plata entró ese día. Un cobro
    // "futuro" sumaría en la caja de un mes que todavía no pasó. Para
    // pagar por adelantado se elige el período, no se corre esta fecha.
    if (input.fechaPago > hoy) {
      return validationError([
        {
          path: "fechaPago",
          message:
            "La fecha de cobro no puede ser posterior a hoy. Para adelantar un mes, elegí el período.",
        },
      ]);
    }
    if (inicioFueraDeMargen(input.cubreDesde, hoy)) {
      return validationError([
        {
          path: "cubreDesde",
          message: `El período tiene que arrancar dentro de los ${MESES_DE_MARGEN} meses anteriores o siguientes a hoy.`,
        },
      ]);
    }
    if (input.modalidad === "MEDIO_MES" && input.meses > 1) {
      return validationError([{ path: "meses", message: "El 1/2 mes se cobra de a uno." }]);
    }
    if (await existePagoConClave(tx, ctx, input.idempotencyKey)) {
      return conflict(
        "Este pago ya quedó registrado (el formulario se envió dos veces). Revisá el historial antes de volver a cargarlo.",
      );
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

    // La cobertura se deriva de la modalidad y de cuántos meses se pagan.
    // Es la única aritmética de fechas del flujo, vive en el dominio y está
    // cubierta por tests. Los meses van encadenados: cada uno arranca el
    // día después del anterior, así el ciclo no se corre.
    const coberturas: Cobertura[] =
      input.modalidad === "MES_COMPLETO"
        ? mesesEncadenados(input.cubreDesde, input.meses)
        : [coberturaDe(input.modalidad, input.cubreDesde)];
    const pedido = { desde: coberturas[0]!.desde, hasta: coberturas[coberturas.length - 1]!.hasta };
    const nombre = nombreCompleto(alumno.nombre, alumno.apellido);

    if (!input.confirmarSuperposicion) {
      const [superpuestos, mismoDia] = await Promise.all([
        buscarCoberturaSuperpuesta(tx, ctx, input.studentId, pedido),
        pagosVigentesDelDia(tx, ctx, input.studentId, input.fechaPago),
      ]);
      if (superpuestos.length > 0 || mismoDia.length > 0) {
        return confirmacionRequerida({
          alumno: nombre,
          pedido,
          existentes: superpuestos.map((s) => ({
            desde: s.desde,
            hasta: s.hasta,
            fechaPago: s.fechaPago,
            monto: Number(s.monto),
          })),
          mismoDia: mismoDia.map((p) => ({
            fechaPago: p.fechaPago,
            monto: Number(p.monto),
            desde: p.desde,
            hasta: p.hasta,
          })),
        });
      }
    }

    const ids: string[] = [];
    for (const [i, cobertura] of coberturas.entries()) {
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
          // Solo el primero: la clave es única por gimnasio, y con ella
          // alcanza para que un reenvío no entre ni a medias.
          idempotencyKey: i === 0 ? input.idempotencyKey : null,
        },
        tramosImputados(cobertura),
      );
      ids.push(fila.id);

      await logActivity(tx, ctx, {
        accion: "payment.created",
        entidad: "payment",
        entidadId: fila.id,
        resumen:
          `Pago de ${nombre}: ${ETIQUETA_MODALIDAD[input.modalidad]} (${plan.nombre}) del ${cobertura.desde} al ${cobertura.hasta}` +
          (coberturas.length > 1 ? ` (mes ${i + 1} de ${coberturas.length})` : "") +
          `, cobrado el ${input.fechaPago}`,
        cambios: {
          monto: { antes: null, despues: input.monto },
          cobertura: { antes: null, despues: `${cobertura.desde}..${cobertura.hasta}` },
          plan: { antes: null, despues: plan.nombre },
        },
      });
    }

    return ok({
      id: ids[0]!,
      ids,
      studentId: alumno.id,
      alumno: nombre,
      telefono: alumno.telefono,
      planNombre: plan.nombre,
      monto: input.monto,
      total: input.monto * coberturas.length,
      meses: coberturas.length,
      fechaPago: input.fechaPago,
      cubreDesde: pedido.desde,
      cubreHasta: pedido.hasta,
      modalidad: input.modalidad,
    });
  });
});
