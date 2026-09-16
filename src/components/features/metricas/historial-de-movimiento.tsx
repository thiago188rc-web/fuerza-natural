"use client";

import { motion, useReducedMotion } from "motion/react";
import type { PuntoDeMovimiento } from "@/use-cases/metricas/consultas";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

/**
 * EL HISTORIAL DE ALTAS Y BAJAS, mes a mes — los últimos
 * `MESES_DE_HISTORIAL` (`consultas.ts`), no solo el período que esté
 * eligiendo el selector de vista: es la lectura de "cómo viene creciendo o
 * achicándose el padrón", independiente de si hoy se está mirando la
 * semana o el año.
 *
 * Sale de `student_events` reales (ALTA/REACTIVACION/BAJA), el mismo dato
 * que ya usa `MovimientoDelPeriodo` — no una cuenta aparte ni un número
 * copiado de una planilla.
 *
 * Cada barra apila tres tramos — nuevos, volvieron, bajas — y cada tramo
 * muestra su propio número, no solo el color: un gimnasio se lee de un
 * vistazo, pero se factura y se decide con números, no con manchas.
 * "Altas" (el rótulo arriba de la barra) es nuevos + volvieron: cuánta
 * gente entró ese mes, sin importar si era la primera vez o si volvía.
 */
const ALTURA_PISTA_REM = 9;
const ALTURA_MINIMA_TRAMO_REM = 1.05;

export function HistorialDeMovimiento({ puntos }: { puntos: PuntoDeMovimiento[] }) {
  const quieto = useReducedMotion();
  const maximo = Math.max(1, ...puntos.map((p) => p.nuevos + p.volvieron + p.dejaron));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <Leyenda color="bg-verde-fuerte" etiqueta="Nuevos" />
        <Leyenda color="bg-verde-claro" etiqueta="Volvieron" />
        <Leyenda color="bg-descubierto" etiqueta="Bajas" />
        <span className="text-[0.7rem] text-muted-foreground/70">
          (Altas = nuevos + volvieron)
        </span>
      </div>

      <div className="-mx-1 mt-4 overflow-x-auto px-1">
        <div
          className="flex items-end gap-4 sm:gap-6"
          style={{ minWidth: `${Math.max(puntos.length * 3.25, 16)}rem` }}
        >
          {puntos.map((punto, i) => {
            return (
              <div key={punto.mes} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="tabular text-[0.75rem] font-medium whitespace-nowrap">
                  Altas: {punto.altas}
                </span>

                <div
                  className="flex w-full flex-col-reverse items-stretch justify-start"
                  style={{ height: `${ALTURA_PISTA_REM}rem` }}
                  title={`${punto.etiqueta}: ${punto.nuevos} nuevos, ${punto.volvieron} volvieron, ${punto.dejaron} bajas`}
                >
                  <Tramo
                    valor={punto.nuevos}
                    maximo={maximo}
                    color="bg-verde-fuerte"
                    textoClaro
                    quieto={quieto}
                    retraso={i * 0.04}
                  />
                  <Tramo
                    valor={punto.volvieron}
                    maximo={maximo}
                    color="bg-verde-claro"
                    textoClaro={false}
                    quieto={quieto}
                    retraso={i * 0.04 + 0.03}
                  />
                  <Tramo
                    valor={punto.dejaron}
                    maximo={maximo}
                    color="bg-descubierto"
                    textoClaro
                    quieto={quieto}
                    retraso={i * 0.04 + 0.06}
                  />
                </div>

                <span className="text-[0.7rem] whitespace-nowrap text-muted-foreground capitalize">
                  {punto.etiqueta}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Leyenda({ color, etiqueta }: { color: string; etiqueta: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2 rounded-full", color)} />
      {etiqueta}
    </span>
  );
}

/**
 * Un tramo del apilado. La altura ES proporcional al máximo del grupo,
 * pero con un piso: sin él, "1 baja" en un mes de 40 movimientos totales
 * dibuja una franja de medio píxel que ningún número entra a mostrar.
 */
function Tramo({
  valor,
  maximo,
  color,
  textoClaro,
  quieto,
  retraso,
}: {
  valor: number;
  maximo: number;
  color: string;
  textoClaro: boolean;
  quieto: boolean | null;
  retraso: number;
}) {
  if (valor === 0) return null;

  const alturaProporcional = (valor / maximo) * ALTURA_PISTA_REM;
  const altura = Math.max(alturaProporcional, ALTURA_MINIMA_TRAMO_REM);

  return (
    <motion.div
      initial={quieto ? { scaleY: 1 } : { scaleY: 0 }}
      animate={{ scaleY: 1 }}
      transition={{ duration: DURACION.pausado, ease: SALIDA, delay: quieto ? 0 : retraso }}
      style={{ height: `${altura}rem`, transformOrigin: "bottom" }}
      className={cn(
        "flex items-center justify-center first:rounded-b-[3px] last:rounded-t-[3px]",
        color,
      )}
    >
      <span
        className={cn(
          "tabular font-mono text-[0.7rem] leading-none",
          textoClaro ? "text-white" : "text-foreground/80",
        )}
      >
        {valor}
      </span>
    </motion.div>
  );
}
