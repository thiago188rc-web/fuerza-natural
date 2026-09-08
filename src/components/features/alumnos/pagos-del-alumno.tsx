"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ChevronDown, Receipt } from "lucide-react";
import type { PagoDeLaFicha } from "@/use-cases/alumnos/ficha";
import { ETIQUETA_MODALIDAD, type Modalidad } from "@/domain/pagos/modalidad";
import { etiquetaCorta } from "@/domain/fechas/calendario";
import { ETIQUETA_METODO } from "@/schemas/payment";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { BotonLink } from "@/components/boton-link";
import { Importe } from "@/components/importe";
import { IrAPestana } from "@/components/pestanas";
import { cn } from "@/lib/utils";

const VISIBLES_AL_PRINCIPIO = 6;
const VISIBLES_EN_RESUMEN = 4;

/**
 * Los pagos del alumno. Cada fila dice CUÁNDO se cobró y QUÉ cubrió, que
 * son dos cosas distintas y las dos importan: un pago del 3 de septiembre
 * puede estar cubriendo agosto.
 *
 * En modo `resumen` muestra los últimos cuatro y un enlace a la pestaña
 * de pagos; en modo completo, seis y un botón para desplegar el resto.
 *
 * Los pagos anulados quedan a la vista, tachados y con su motivo. El
 * historial es un registro contable: no se reescribe para que quede
 * prolijo.
 */
export function PagosDelAlumno({
  pagos,
  moneda,
  hoy,
  total,
  alumnoId,
  puedeCobrar,
  resumen = false,
}: {
  pagos: PagoDeLaFicha[];
  moneda: string;
  hoy: string;
  total: number;
  alumnoId: string;
  puedeCobrar: boolean;
  resumen?: boolean;
}) {
  const quieto = useReducedMotion();
  const [expandido, setExpandido] = useState(false);

  const tope = resumen ? VISIBLES_EN_RESUMEN : VISIBLES_AL_PRINCIPIO;
  const visibles = expandido && !resumen ? pagos : pagos.slice(0, tope);
  const restantes = pagos.length - visibles.length;

  return (
    <section className="superficie overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="t-seccion">Pagos</h2>
        {pagos.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            <span className="tabular text-foreground">{pagos.length}</span>{" "}
            {pagos.length === 1 ? "registro" : "registros"} ·{" "}
            <Importe valor={total} moneda={moneda} className="text-foreground" /> en total
          </p>
        ) : null}
      </header>

      {pagos.length === 0 ? (
        <div className="flex flex-col items-center border-t border-border px-6 py-12 text-center">
          <span className="grid size-10 place-items-center rounded-full text-muted-foreground ring-1 ring-border">
            <Receipt className="size-4.5" strokeWidth={1.75} />
          </span>
          <p className="mt-3 text-sm font-medium">Todavía no registró ningún pago</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Cuando le cobres, el pago y el período que cubre van a aparecer acá.
          </p>
          {puedeCobrar ? (
            <BotonLink href={`/pagos/nuevo?alumno=${alumnoId}`} className="mt-4" size="sm">
              Registrar el primero
            </BotonLink>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border border-t border-border">
            <AnimatePresence initial={false}>
              {visibles.map((pago, i) => (
                <motion.li
                  key={pago.id}
                  layout={!quieto}
                  initial={quieto || i < tope ? false : { opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: DURACION.rapido,
                    ease: SALIDA,
                    delay: quieto ? 0 : Math.min(6, i - tope) * 0.02,
                  }}
                  className={cn(
                    "fila flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3",
                    pago.anulado && "opacity-55",
                  )}
                >
                  <span className="tabular w-14 shrink-0 font-mono text-xs text-muted-foreground">
                    {etiquetaCorta(pago.fechaPago, hoy)}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="tabular text-sm">
                        {pago.cubreDesde && pago.cubreHasta ? (
                          <>
                            {etiquetaCorta(pago.cubreDesde, hoy)}
                            <span className="mx-1 text-border-strong">→</span>
                            {etiquetaCorta(pago.cubreHasta, hoy)}
                          </>
                        ) : (
                          "Sin período registrado"
                        )}
                      </span>
                      {pago.modalidad === "MEDIO_MES" ? (
                        <span className="text-[0.7rem] font-medium text-foreground">
                          {ETIQUETA_MODALIDAD[pago.modalidad as Modalidad]}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {pago.planNombreSnapshot} ·{" "}
                      {ETIQUETA_METODO[pago.metodo as keyof typeof ETIQUETA_METODO] ?? pago.metodo}
                      {pago.nota ? ` · ${pago.nota}` : ""}
                    </span>
                    {pago.anulado ? (
                      <span className="mt-0.5 block text-xs text-descubierto">
                        Anulado{pago.anuladoMotivo ? ` · ${pago.anuladoMotivo}` : ""}
                      </span>
                    ) : null}
                  </span>

                  <span className={cn("font-mono text-sm", pago.anulado && "line-through")}>
                    <Importe valor={pago.monto} moneda={moneda} simboloClassName="text-xs" />
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {restantes > 0 && resumen ? (
            <div className="hundido flex justify-center border-t border-border py-2.5">
              <IrAPestana clave="pagos">
                Ver los {pagos.length} pagos
                <ArrowRight className="size-3" strokeWidth={2.25} />
              </IrAPestana>
            </div>
          ) : restantes > 0 ? (
            <button
              type="button"
              onClick={() => setExpandido(true)}
              className="hundido flex w-full items-center justify-center gap-1.5 border-t border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
            >
              Ver {restantes} pagos anteriores
              <ChevronDown className="size-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
