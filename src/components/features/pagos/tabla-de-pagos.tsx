"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Receipt } from "lucide-react";
import type { PagoDelHistorial } from "@/use-cases/pagos/consultas";
import { ETIQUETA_MODALIDAD, type Modalidad } from "@/domain/pagos/modalidad";
import { etiquetaCorta } from "@/domain/fechas/calendario";
import { ETIQUETA_METODO } from "@/schemas/payment";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { BotonLink } from "@/components/boton-link";
import { BotonWhatsapp } from "@/components/boton-whatsapp";
import { mensajeConfirmacionDePago } from "@/lib/mensajes-whatsapp";
import { Importe } from "@/components/importe";
import { cn } from "@/lib/utils";

/**
 * EL HISTORIAL — una tabla financiera, con la disciplina de una.
 *
 *   · Los importes a la derecha, en mono tabular, con el "$" más liviano
 *     que la cifra. Una columna de plata se lee de derecha a izquierda:
 *     primero los millares, después el resto.
 *   · Las líneas divisorias apagadas y el encabezado hundido: la
 *     estructura se ve, pero no compite con los números.
 *   · El encabezado se queda pegado al hacer scroll. Con cuarenta filas,
 *     perder de vista qué columna es "Cubre" es perder la tabla.
 *
 * La columna que la mayoría de los sistemas no tiene es "Cubre": el
 * período real. Sin ella, "$65.000 el 3 de septiembre" no dice si pagó
 * septiembre, agosto atrasado o los primeros quince días de octubre —y esa
 * es exactamente la pregunta que se hace quien revisa el historial.
 *
 * Un pago anulado NO desaparece: se muestra tachado y con su motivo. El
 * historial es un registro contable, no una lista de lo que quedó lindo.
 */
export function TablaDePagos({
  pagos,
  moneda,
  hoy,
}: {
  pagos: PagoDelHistorial[];
  moneda: string;
  hoy: string;
}) {
  const quieto = useReducedMotion();

  if (pagos.length === 0) {
    return (
      <section className="superficie flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="grid size-10 place-items-center rounded-full text-muted-foreground ring-1 ring-border">
          <Receipt className="size-4.5" strokeWidth={1.75} />
        </span>
        <h2 className="t-seccion mt-4">No hay pagos en este mes</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Probá con otro mes, o registrá el primero.
        </p>
        <BotonLink href="/pagos/nuevo" className="mt-5">
          Registrar pago
        </BotonLink>
      </section>
    );
  }

  return (
    <section className="superficie overflow-hidden">
      {/* En pantalla chica no se manda la tabla entera a un scroll lateral:
          el importe quedaba fuera de la vista, que es lo primero que se
          viene a mirar. Se caen "Modalidad", "Cubre" y "Método" —el
          período reaparece bajo el nombre, y "1/2 mes" solo cuando es la
          excepción— y lo que queda entra en 375px. De `sm` para arriba
          vuelve la tabla completa. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm sm:min-w-[46rem]">
          <caption className="sr-only">Pagos registrados en el período consultado</caption>
          <thead className="hundido sticky top-14 z-10 lg:top-0">
            <tr className="border-b border-border text-left">
              <Encabezado className="w-[4.5rem] pl-5">Fecha</Encabezado>
              <Encabezado>Alumno</Encabezado>
              <Encabezado className="hidden w-[7.5rem] sm:table-cell">Modalidad</Encabezado>
              <Encabezado className="hidden w-[9.5rem] sm:table-cell">Cubre</Encabezado>
              <Encabezado className="hidden w-[9rem] sm:table-cell">Método</Encabezado>
              <Encabezado className="w-[7.5rem] pr-3 text-right">Importe</Encabezado>
              <Encabezado className="w-9 pr-5">
                <span className="sr-only">WhatsApp</span>
              </Encabezado>
            </tr>
          </thead>
          <tbody>
            {pagos.map((pago, i) => (
              <motion.tr
                key={pago.id}
                initial={quieto || i > 14 ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: DURACION.rapido,
                  ease: SALIDA,
                  delay: quieto ? 0 : Math.min(i, 14) * 0.016,
                }}
                className={cn(
                  "fila border-b border-border last:border-0",
                  pago.anulado && "opacity-55",
                )}
              >
                <td className="tabular py-3 pl-5 align-top font-mono text-xs whitespace-nowrap text-muted-foreground">
                  {etiquetaCorta(pago.fechaPago, hoy)}
                </td>

                <td className="py-3 pr-3 align-top">
                  <Link
                    href={`/alumnos/${pago.studentId}`}
                    className={cn(
                      "rounded-sm font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none",
                      pago.anulado && "line-through",
                    )}
                  >
                    {pago.nombre} {pago.apellido}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {pago.planNombreSnapshot}
                  </span>
                  {pago.cubreDesde && pago.cubreHasta ? (
                    <span className="tabular block font-mono text-[0.7rem] whitespace-nowrap text-muted-foreground/80 sm:hidden">
                      {etiquetaCorta(pago.cubreDesde, hoy)} → {etiquetaCorta(pago.cubreHasta, hoy)}
                    </span>
                  ) : null}
                  {pago.modalidad === "MEDIO_MES" ? (
                    <span className="mt-1 inline-flex items-center rounded-md bg-revisar-suave px-1.5 py-0.5 text-[0.7rem] text-revisar sm:hidden">
                      {ETIQUETA_MODALIDAD.MEDIO_MES}
                    </span>
                  ) : null}
                  {pago.anulado ? (
                    <span className="mt-0.5 block text-xs text-descubierto">
                      Anulado{pago.anuladoMotivo ? ` · ${pago.anuladoMotivo}` : ""}
                    </span>
                  ) : pago.nota ? (
                    <span className="mt-0.5 block max-w-[18rem] truncate text-xs text-muted-foreground/80">
                      {pago.nota}
                    </span>
                  ) : null}
                </td>

                <td className="hidden py-3 pr-3 align-top whitespace-nowrap sm:table-cell">
                  <Modalidad valor={pago.modalidad} />
                </td>

                <td className="tabular hidden py-3 pr-3 align-top font-mono text-xs whitespace-nowrap text-muted-foreground sm:table-cell">
                  {pago.cubreDesde && pago.cubreHasta ? (
                    <>
                      {etiquetaCorta(pago.cubreDesde, hoy)}
                      <span className="mx-1 text-border-strong">→</span>
                      {etiquetaCorta(pago.cubreHasta, hoy)}
                    </>
                  ) : (
                    "—"
                  )}
                </td>

                <td className="hidden py-3 pr-3 align-top text-xs whitespace-nowrap text-muted-foreground sm:table-cell">
                  {ETIQUETA_METODO[pago.metodo as keyof typeof ETIQUETA_METODO] ?? pago.metodo}
                  <span className="block max-w-[9rem] truncate text-[0.7rem] text-muted-foreground/70">
                    {pago.registradoPorNombre}
                  </span>
                </td>

                <td
                  className={cn(
                    "py-3 pr-3 text-right align-top font-mono text-[0.9375rem] whitespace-nowrap",
                    pago.anulado && "line-through",
                  )}
                >
                  <Importe valor={pago.monto} moneda={moneda} simboloClassName="text-xs" />
                </td>

                <td className="py-3 pr-5 align-top">
                  {!pago.anulado && pago.cubreHasta ? (
                    <BotonWhatsapp
                      telefono={pago.telefono}
                      mensaje={mensajeConfirmacionDePago({
                        nombre: pago.nombre,
                        monto: pago.monto,
                        moneda,
                        modalidad: pago.modalidad,
                        planNombre: pago.planNombreSnapshot,
                        cubreHasta: pago.cubreHasta,
                      })}
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Enviar WhatsApp a ${pago.nombre} ${pago.apellido}`}
                    >
                      <span className="sr-only">Enviar WhatsApp</span>
                    </BotonWhatsapp>
                  ) : null}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * La modalidad como texto con una marca, no como píldora de color: el
 * color en este sistema significa cobertura, y una píldora ámbar para
 * "1/2 mes" se leería como "para revisar". La excepción se marca con
 * peso, no con tono.
 */
function Modalidad({ valor }: { valor: string }) {
  const esMedio = valor === "MEDIO_MES";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        esMedio ? "font-medium text-foreground" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-[1.5px]",
          esMedio ? "bg-foreground" : "bg-border-strong",
        )}
      />
      {ETIQUETA_MODALIDAD[valor as Modalidad] ?? valor}
    </span>
  );
}

function Encabezado({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("t-rotulo py-2.5 pr-3 font-normal", className)}>
      {children}
    </th>
  );
}
