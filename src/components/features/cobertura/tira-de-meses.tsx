"use client";

import { motion, useReducedMotion } from "motion/react";
import type { MesDeLaTira } from "@/use-cases/alumnos/ficha";
import { etiquetaDeMes } from "@/domain/fechas/calendario";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

/**
 * LA TIRA — doce meses de cobertura, uno al lado del otro.
 *
 * Cada columna es un mes y cada banda dentro de la columna es un tramo
 * realmente cubierto, en su posición exacta dentro del mes. Un alumno que
 * paga todos los 3 se ve como doce columnas llenas; uno que se fue en
 * marzo y volvió en julio se ve como el hueco que es. Dos medios meses con
 * un bache en el medio se ven como dos bandas separadas, no como "medio
 * mes pagado".
 *
 * Es la única vista del producto que se lee de forma vertical, y eso es
 * deliberado: el resto del sistema mide UN mes sobre un riel horizontal;
 * acá la pregunta es otra —cómo viene esta persona a lo largo del año— y
 * merece una forma propia.
 */
export function TiraDeMeses({
  tira,
  posicionDeHoy,
  className,
}: {
  tira: MesDeLaTira[];
  posicionDeHoy: number;
  className?: string;
}) {
  const quieto = useReducedMotion();

  // Ancho acotado: a lo ancho de una columna entera cada mes queda más
  // ancho que alto, y la tira se lee como doce cuadrados sueltos en vez de
  // como una serie.
  return (
    <div className={cn("flex max-w-md items-end gap-1.5", className)}>
      {tira.map((mes, i) => {
        const vacio = mes.segmentos.length === 0;

        return (
          <div key={mes.clave} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div
              className={cn(
                "relative h-16 w-full overflow-hidden rounded-[3px]",
                mes.esElMesActual ? "bg-muted ring-1 ring-verde/35" : "bg-muted",
              )}
              title={`${etiquetaDeMes(mes.mes)}: ${
                vacio ? "sin cobertura" : `${mes.diasCubiertos} días cubiertos`
              }`}
            >
              {mes.segmentos.map((s, j) => (
                <motion.span
                  key={`${mes.clave}-${j}`}
                  className={cn(
                    "absolute inset-x-0 rounded-[2px]",
                    mes.esElMesActual ? "bg-cubierto" : "bg-cubierto/70",
                  )}
                  // El mes crece hacia arriba: el día 1 abajo, el 30 arriba.
                  style={{
                    bottom: `${s.inicio * 100}%`,
                    height: `${Math.max(0.04, s.fin - s.inicio) * 100}%`,
                    transformOrigin: "bottom",
                  }}
                  initial={quieto ? false : { opacity: 0, scaleY: 0.3 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  transition={{
                    duration: DURACION.normal,
                    ease: SALIDA,
                    delay: quieto ? 0 : i * 0.025,
                  }}
                />
              ))}

              {mes.esElMesActual ? (
                <span
                  aria-hidden
                  className="absolute inset-x-0 h-px bg-verde"
                  style={{ bottom: `${posicionDeHoy * 100}%` }}
                />
              ) : null}
            </div>

            <span
              className={cn(
                "font-mono text-[0.65rem] leading-none",
                mes.esElMesActual ? "font-semibold text-verde" : "text-muted-foreground/70",
              )}
            >
              {mes.inicial}
            </span>
          </div>
        );
      })}
    </div>
  );
}
