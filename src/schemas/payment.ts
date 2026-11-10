import { z } from "zod";
import { MAXIMO_MESES_POR_COBRO } from "@/domain/pagos/periodos";
import { opcional } from "./_helpers";

/**
 * Registro de un pago. Un pago cubre un PERÍODO REAL — nunca "30 días
 * desde el pago". La construcción del período concreto la hace el caso de
 * uso con `coberturaDe()`, no este schema.
 *
 * `gymId` no existe acá a propósito: nunca viene del cliente, sale de la
 * sesión.
 *
 * `planId` es CUÁNTOS DÍAS cubre este pago (2, 3, 4 o 5: los planes
 * activos del gimnasio), que el dueño elige al cobrar
 * (docs/REGLAS-DE-NEGOCIO.md §4bis). Llega solo el id: el nombre y los
 * días del snapshot los lee el caso de uso de la base, y un id que no sea
 * un plan activo de ESTE gimnasio se rechaza. Un cliente manipulado puede,
 * como mucho, elegir otro plan real — lo mismo que ofrece la pantalla. Sin
 * `planId`, el pago va con el plan habitual del alumno.
 *
 * Tampoco existe `decisionPlan`: un pago NUNCA cambia el plan habitual del
 * alumno (docs/REGLAS-DE-NEGOCIO.md §4). Cambiar de plan es otra
 * operación, con su propio registro en el historial.
 *
 * Ni `metodo`: la forma de pago ya no se pregunta (pedido del dueño,
 * 2026-10-22). El caso de uso guarda `OTRO`, el valor que ya significaba
 * "sin dato" en los pagos importados — no un `EFECTIVO` que nadie dijo.
 */

/**
 * QUÉ cobertura se compró. No es el plan del alumno.
 *
 *   MES_COMPLETO — un mes corrido desde el día de arranque (§3bis).
 *   MEDIO_MES    — "1/2 MES": 15 días consecutivos, que pueden empezar
 *                  cualquier día (principio, medio o fin de mes).
 *
 * Registrar un MEDIO_MES NO cambia el plan habitual del alumno: un alumno
 * de 5 días que paga medio mes sigue siendo de 5 días
 * (docs/REGLAS-DE-NEGOCIO.md §3, §4).
 */
export const MODALIDADES_PAGO = ["MES_COMPLETO", "MEDIO_MES"] as const;
export type ModalidadPago = (typeof MODALIDADES_PAGO)[number];

/**
 * Los valores que admite `payments.metodo` (CHECK en la base). Ya no se
 * eligen al cobrar; quedan por los pagos viejos, que los tienen.
 */
export const METODOS_PAGO = ["EFECTIVO", "TRANSFERENCIA", "BILLETERA", "OTRO"] as const;

/** Lo que se guarda desde que no se pregunta la forma de pago: "sin dato". */
export const METODO_SIN_DATO = "OTRO" satisfies (typeof METODOS_PAGO)[number];

export const registrarPagoSchema = z.object({
  studentId: z.string().uuid("Elegí un alumno."),
  /**
   * FECHA DE COBRO: cuándo entró la plata. Puede ser anterior a hoy (se
   * carga un pago de ayer), nunca posterior — eso lo rechaza el caso de
   * uso y un CHECK de la base. No es el período que se paga: para
   * adelantar un mes se elige `cubreDesde`, no se corre esta fecha
   * (docs/REGLAS-DE-NEGOCIO.md §5bis).
   */
  fechaPago: z.string().date("Fecha inválida. Usá el formato AAAA-MM-DD."),
  modalidad: z.enum(MODALIDADES_PAGO).default("MES_COMPLETO"),
  /**
   * PERÍODO IMPUTADO: desde qué día corre lo que se paga. Puede ser
   * atrasado, el que corre o futuro — independiente de `fechaPago`.
   *
   * En MES_COMPLETO es el día de arranque del primer mes: cubre un mes
   * corrido desde ahí (§3bis). En MEDIO_MES es el primero de los 15 días.
   * El caso de uso rechaza un arranque a más de 12 meses de hoy.
   */
  cubreDesde: z.string().date("Fecha inválida. Usá el formato AAAA-MM-DD."),
  /**
   * Cuántos meses seguidos se pagan juntos, desde `cubreDesde`. Cada mes
   * queda como un pago propio (anulable por separado) con su período.
   * Solo MES_COMPLETO: un 1/2 mes se cobra de a uno.
   */
  meses: z.coerce
    .number({ error: "Elegí cuántos meses paga." })
    .int("Elegí cuántos meses paga.")
    .min(1, "Elegí cuántos meses paga.")
    .max(MAXIMO_MESES_POR_COBRO, `Se pueden cobrar hasta ${MAXIMO_MESES_POR_COBRO} meses juntos.`)
    .default(1),
  /**
   * El importe DE CADA MES. Se autocompleta con el precio vigente
   * configurado, y el dueño puede editarlo (un pago parcial, un ajuste).
   * Nunca sale de una constante del código. Con `meses` > 1, cada pago
   * guarda este importe y el total cobrado es `monto × meses`.
   */
  monto: z.coerce
    .number({ error: "Ingresá un importe." })
    .min(0, "El importe no puede ser negativo.")
    .max(99_999_999, "Importe demasiado alto."),
  /** Cuántos días cubre este pago. Sin él, el plan habitual del alumno. */
  planId: z.string().uuid("Elegí cuántos días por semana paga.").optional(),
  nota: opcional(z.string().trim().max(300, "La nota no puede superar los 300 caracteres.")),
  /** Evita el pago doble por doble clic o por reenvío del formulario. */
  idempotencyKey: z.string().uuid(),
  /**
   * El usuario ya vio la advertencia —cobertura superpuesta, u otro pago
   * del mismo alumno con la misma fecha de cobro— y decidió seguir. Sin
   * esto, el caso de uso devuelve CONFIRMACION_REQUERIDA en vez de
   * escribir.
   */
  confirmarSuperposicion: z.coerce.boolean().optional(),
});

export type RegistrarPagoInput = z.infer<typeof registrarPagoSchema>;
export type RegistrarPagoRaw = z.input<typeof registrarPagoSchema>;

/**
 * Anular un pago cargado por error: otro alumno, otro importe, otro mes.
 *
 * El pago NO se borra ni se edita: queda en el historial, tachado y con
 * este motivo, y deja de contar para la cobertura y para lo cobrado (todas
 * las consultas filtran `anulado_en is null`). Si la persona pagó de
 * verdad, se vuelve a registrar bien. Es la regla de
 * docs/REGLAS-DE-NEGOCIO.md: "corregir un pago = anular + volver a
 * registrar". El motivo es obligatorio porque es lo único que explica
 * después por qué falta esa plata.
 */
export const anularPagoSchema = z.object({
  paymentId: z.string().uuid("Pago inválido."),
  motivo: z
    .string({ error: "Escribí por qué se anula." })
    .trim()
    .min(5, "Escribí por qué se anula (al menos 5 caracteres).")
    .max(300, "El motivo no puede superar los 300 caracteres."),
});

export type AnularPagoRaw = z.input<typeof anularPagoSchema>;

/**
 * Cambiar los días de un pago ya cargado (pagó 2 días y quiere 3, o al
 * revés). El pago no se edita: se anula y se registra uno igual —misma
 * fecha de cobro, mismo período— con el plan nuevo. `monto` es opcional:
 * sin él se usa el precio configurado del plan nuevo.
 */
export const cambiarDiasDelPagoSchema = z.object({
  paymentId: z.string().uuid("Pago inválido."),
  planId: z.string().uuid("Elegí cuántos días por semana paga."),
  monto: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce
      .number({ error: "Ingresá un importe." })
      .min(0, "El importe no puede ser negativo.")
      .max(99_999_999, "Importe demasiado alto.")
      .optional(),
  ),
});

export type CambiarDiasDelPagoRaw = z.input<typeof cambiarDiasDelPagoSchema>;
