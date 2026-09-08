"use client";

import { motion, useReducedMotion } from "motion/react";
import { etiquetaDeMes, posicionEnElMes, primerDiaDelMes } from "@/domain/fechas/calendario";
import { segmentosDelMes, type TramoCubierto } from "@/domain/pagos/cobertura";
import { tramosImputados, type Cobertura } from "@/domain/pagos/modalidad";
import { DURACION, SALIDA } from "@/components/motion/tokens";

/**
 * QUÉ VA A QUEDAR CUBIERTO. La pieza que hace que registrar un pago no
 * sea un acto de fe.
 *
 * Dibuja un riel por cada mes que toca la cobertura. Lo que ya estaba
 * pagado va en verde apagado; lo que se está por registrar, en negro. Ver
 * los dos sobre el mismo eje contesta de un vistazo la única pregunta
 * peligrosa del flujo —"¿esto no lo pagó ya?"— y hace visible el caso que
 * un sistema de "último pago + 30 días" no puede representar: un medio mes
 * que arranca el 25 y se derrama al mes siguiente.
 *
 * Los cálculos son las mismas funciones puras del dominio que usa el
 * servidor. La vista previa no puede discrepar del resultado real porque
 * no tiene aritmética propia.
 */
export function VistaPreviaDeCobertura({
  cobertura,
  existentes,
  hoy,
}: {
  cobertura: Cobertura;
  existentes: readonly TramoCubierto[];
  hoy: string;
}) {
  const quieto = useReducedMotion();
  const tramos = tramosImputados(cobertura);

  return (
    <div className="space-y-3">
      {tramos.map((tramo) => {
        const mes = primerDiaDelMes(tramo.cubreDesde);
        const nuevos = segmentosDelMes(mes, [
          { desde: tramo.cubreDesde, hasta: tramo.cubreHasta },
        ]);
        const previos = segmentosDelMes(mes, existentes);
        const esElMesDeHoy = mes === primerDiaDelMes(hoy);

        return (
          <div key={tramo.periodo}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium capitalize">
                {etiquetaDeMes(mes, { conAnio: false })}
              </span>
              <span className="tabular font-mono text-[0.7rem] text-muted-foreground">
                {Number(tramo.cubreDesde.slice(8, 10))} al {Number(tramo.cubreHasta.slice(8, 10))}
              </span>
            </div>

            <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
              {previos.map((s, i) => (
                <span
                  key={`previo-${i}`}
                  className="absolute inset-y-0 rounded-full bg-cubierto/45"
                  style={{
                    left: `${s.inicio * 100}%`,
                    width: `${Math.max(0, s.fin - s.inicio) * 100}%`,
                  }}
                />
              ))}

              {nuevos.map((s, i) => (
                <motion.span
                  key={`nuevo-${i}`}
                  className="absolute inset-y-0 rounded-full bg-verde"
                  style={{
                    left: `${s.inicio * 100}%`,
                    width: `${Math.max(0, s.fin - s.inicio) * 100}%`,
                  }}
                  initial={quieto ? false : { opacity: 0, scaleX: 0.6 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ duration: DURACION.rapido, ease: SALIDA }}
                />
              ))}

              {esElMesDeHoy ? (
                <span
                  aria-hidden
                  className="absolute inset-y-0 w-px bg-foreground/50"
                  style={{ left: `${posicionEnElMes(hoy) * 100}%` }}
                />
              ) : null}
            </div>
          </div>
        );
      })}

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[0.7rem] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px] bg-verde" />
          Este pago
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px] bg-cubierto/45" />
          Ya cubierto
        </span>
      </p>
    </div>
  );
}
