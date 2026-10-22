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
 *
 * LAS LÍNEAS DE CADA SERIE (pedido del dueño, 2026-10-22): el final de
 * cada tramo lleva un punto de su color, y los puntos del mismo color se
 * unen mes a mes — verde con verde, celeste con celeste, rojo con rojo —
 * para seguir cada serie a lo largo del tiempo sin saltar de barra en
 * barra. Es el mismo lenguaje que `BarraConTendencia` (punto con halo
 * sobre una línea), con una línea por serie en vez de una sola. La
 * geometría sale de `alturasDelApilado`, la MISMA que dibuja los tramos:
 * los puntos caen exactamente en el borde de cada color, sin medir el DOM.
 * Un mes en que una serie vale 0 no tiene tramo de ese color: no lleva
 * punto y la línea de esa serie se corta ahí, en vez de ir a parar al
 * borde de otro color.
 *
 * Un mes sin `real` (anterior al alta más vieja que tiene el sistema) se
 * dibuja como una franja gris con "s/d", y sus líneas se cortan: un hueco
 * vacío ahí se leería como "no pasó nada" cuando en realidad es "nadie
 * cargó este mes todavía" — mismo criterio que `BarraConTendencia`.
 */
const ALTURA_PISTA_REM = 9;
/** Piso de un tramo con valor: entra el número y el punto no lo tapa. */
const ALTURA_MINIMA_TRAMO_REM = 1.35;

const SERIES = [
  { clave: "nuevos", etiqueta: "Nuevos", fondo: "bg-verde-fuerte", trazo: "stroke-verde-fuerte" },
  { clave: "volvieron", etiqueta: "Volvieron", fondo: "bg-serie-1", trazo: "stroke-serie-1" },
  { clave: "dejaron", etiqueta: "Bajas", fondo: "bg-descubierto", trazo: "stroke-descubierto" },
] as const;

type ClaveDeSerie = (typeof SERIES)[number]["clave"];

/**
 * La altura (rem) de cada tramo de una barra, de abajo hacia arriba.
 * Proporcional al mes de más movimiento, con un piso para que "1 baja" se
 * pueda leer; si los pisos hacen que la barra se pase de la pista, la
 * barra entera se achica para entrar (si no, invadía el rótulo de arriba).
 */
function alturasDelApilado(punto: PuntoDeMovimiento, maximo: number): Record<ClaveDeSerie, number> {
  const crudas = Object.fromEntries(
    SERIES.map(({ clave }) => {
      const valor = punto[clave];
      return [clave, valor > 0 ? Math.max((valor / maximo) * ALTURA_PISTA_REM, ALTURA_MINIMA_TRAMO_REM) : 0];
    }),
  ) as Record<ClaveDeSerie, number>;
  const total = crudas.nuevos + crudas.volvieron + crudas.dejaron;
  if (total <= ALTURA_PISTA_REM) return crudas;
  const escala = ALTURA_PISTA_REM / total;
  return { nuevos: crudas.nuevos * escala, volvieron: crudas.volvieron * escala, dejaron: crudas.dejaron * escala };
}

/** Dónde termina cada tramo (rem desde la base): el punto de su serie. */
function finalesDelApilado(alturas: Record<ClaveDeSerie, number>): Record<ClaveDeSerie, number> {
  return {
    nuevos: alturas.nuevos,
    volvieron: alturas.nuevos + alturas.volvieron,
    dejaron: alturas.nuevos + alturas.volvieron + alturas.dejaron,
  };
}

export function HistorialDeMovimiento({ puntos }: { puntos: PuntoDeMovimiento[] }) {
  const quieto = useReducedMotion();
  const maximo = Math.max(1, ...puntos.map((p) => p.nuevos + p.volvieron + p.dejaron));
  const columnas = puntos.length;

  const geometria = puntos.map((punto) => {
    const alturas = alturasDelApilado(punto, maximo);
    return { punto, alturas, finales: finalesDelApilado(alturas) };
  });

  // Los tramos de línea de cada serie: meses SEGUIDOS en los que esa serie
  // tiene un tramo dibujado. Donde vale 0 (o no hay dato) la línea se
  // corta: su "final" ahí caería encima del tramo de otro color, y la
  // línea roja terminaría en un punto verde.
  const tramosDeLinea = Object.fromEntries(
    SERIES.map(({ clave }) => {
      const tramos: number[][] = [];
      geometria.forEach(({ punto }, i) => {
        if (!punto.real || punto[clave] === 0) return;
        const ultimo = tramos.at(-1);
        if (ultimo && ultimo.at(-1) === i - 1) ultimo.push(i);
        else tramos.push([i]);
      });
      return [clave, tramos];
    }),
  ) as Record<ClaveDeSerie, number[][]>;

  // Las líneas aparecen cuando las barras ya terminaron de crecer.
  const retrasoDeLineas = quieto ? 0 : columnas * 0.04 + DURACION.pausado * 0.8;
  const grilla = { gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {SERIES.map((s) => (
          <Leyenda key={s.clave} fondo={s.fondo} etiqueta={s.etiqueta} />
        ))}
        <span className="text-[0.7rem] text-muted-foreground/70">(Altas = nuevos + volvieron)</span>
      </div>

      <div className="-mx-1 mt-4 overflow-x-auto px-1">
        {/* Grilla de columnas iguales y SIN `gap`: el aire entre barras va
            adentro de cada columna. Así el centro de la columna i está en
            (i + ½) / n del ancho, y las líneas —un SVG estirado sobre las
            pistas— caen en el centro de cada barra a cualquier ancho. */}
        {/* 5rem por mes: lo que ocupa "Altas: 12 +10" o "Septiembre" sin
            pisarse con el vecino. En pantalla chica el riel scrollea. */}
        <div style={{ minWidth: `${Math.max(columnas * 5, 16)}rem` }}>
          <div className="grid" style={grilla}>
            {puntos.map((punto) => {
              const neto = punto.altas - punto.dejaron;
              return (
                <span
                  key={punto.mes}
                  className="tabular flex items-center justify-center gap-1 pb-1.5 text-[0.75rem] font-medium whitespace-nowrap"
                >
                  Altas: {punto.real ? punto.altas : "s/d"}
                  {/* El saldo neto (altas menos bajas): si ese mes el
                      padrón creció o se achicó, sin restar a mano. */}
                  {punto.real && neto !== 0 ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 text-[0.7rem] font-semibold",
                        neto > 0 ? "text-cubierto" : "text-descubierto",
                      )}
                    >
                      {neto > 0 ? "+" : ""}
                      {neto}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>

          <div className="relative grid" style={{ ...grilla, height: `${ALTURA_PISTA_REM}rem` }}>
            {geometria.map(({ punto, alturas }, i) => {
              const sinMovimiento = punto.nuevos === 0 && punto.volvieron === 0 && punto.dejaron === 0;
              return (
                <div
                  key={punto.mes}
                  className="flex flex-col-reverse items-stretch px-2 sm:px-3"
                  title={
                    punto.real
                      ? `${punto.etiqueta}: ${punto.nuevos} nuevos, ${punto.volvieron} volvieron, ${punto.dejaron} bajas`
                      : `${punto.etiqueta}: sin dato`
                  }
                >
                  {!punto.real ? (
                    <div
                      style={{ height: `${ALTURA_MINIMA_TRAMO_REM}rem` }}
                      className="flex items-center justify-center rounded-[3px] bg-muted-foreground/15"
                    >
                      <span className="text-[0.65rem] text-muted-foreground">s/d</span>
                    </div>
                  ) : sinMovimiento ? (
                    <div style={{ height: "0.2rem" }} className="rounded-[3px] bg-muted-foreground/25" />
                  ) : (
                    SERIES.map((s, j) => (
                      <Tramo
                        key={s.clave}
                        valor={punto[s.clave]}
                        altura={alturas[s.clave]}
                        fondo={s.fondo}
                        quieto={quieto}
                        retraso={i * 0.04 + j * 0.03}
                      />
                    ))
                  )}
                </div>
              );
            })}

            {/* LAS LÍNEAS Y LOS PUNTOS. Decorativos para un lector de
                pantalla: los mismos números ya están en cada tramo y en el
                `title` de cada barra. */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              initial={quieto ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DURACION.rapido, ease: SALIDA, delay: retrasoDeLineas }}
            >
              <svg
                viewBox={`0 0 ${columnas} ${ALTURA_PISTA_REM}`}
                preserveAspectRatio="none"
                className="absolute inset-0 size-full overflow-visible"
              >
                {SERIES.map((s) =>
                  tramosDeLinea[s.clave]
                    .filter((tramo) => tramo.length >= 2)
                    .map((tramo) => (
                      <polyline
                        key={`${s.clave}-${tramo[0]}`}
                        points={tramo
                          .map((i) => `${i + 0.5},${(ALTURA_PISTA_REM - geometria[i]!.finales[s.clave]).toFixed(3)}`)
                          .join(" ")}
                        fill="none"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        // Sin esto, el `preserveAspectRatio="none"` estira
                        // también el grosor del trazo.
                        vectorEffect="non-scaling-stroke"
                        className={s.trazo}
                      />
                    )),
                )}
              </svg>

              {/* Los puntos van en HTML y no en el SVG: el SVG está
                  estirado, y un círculo ahí sería una elipse. */}
              {geometria.map(({ punto, finales }, i) =>
                punto.real
                  ? SERIES.filter((s) => punto[s.clave] > 0).map((s) => (
                      <span
                        key={`${punto.mes}-${s.clave}`}
                        className={cn("absolute size-[7px] rounded-full ring-[1.5px] ring-card", s.fondo)}
                        style={{
                          left: `${((i + 0.5) / columnas) * 100}%`,
                          bottom: `${finales[s.clave]}rem`,
                          transform: "translate(-50%, 50%)",
                        }}
                      />
                    ))
                  : null,
              )}
            </motion.div>
          </div>

          <div className="grid pt-1.5" style={grilla}>
            {puntos.map((punto) => (
              <span
                key={punto.mes}
                className="text-center text-[0.7rem] whitespace-nowrap text-muted-foreground capitalize"
              >
                {punto.etiqueta}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** La muestra de cada serie: la línea con su punto, igual que en el gráfico. */
function Leyenda({ fondo, etiqueta }: { fondo: string; etiqueta: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="relative inline-flex h-2 w-4 items-center justify-center">
        <span className={cn("absolute inset-x-0 h-0.5 rounded-full", fondo)} />
        <span className={cn("relative size-[7px] rounded-full ring-[1.5px] ring-card", fondo)} />
      </span>
      {etiqueta}
    </span>
  );
}

/** Un tramo del apilado, con la altura ya calculada por `alturasDelApilado`. */
function Tramo({
  valor,
  altura,
  fondo,
  quieto,
  retraso,
}: {
  valor: number;
  altura: number;
  fondo: string;
  quieto: boolean | null;
  retraso: number;
}) {
  if (valor === 0) return null;

  return (
    <motion.div
      initial={quieto ? { scaleY: 1 } : { scaleY: 0 }}
      animate={{ scaleY: 1 }}
      transition={{ duration: DURACION.pausado, ease: SALIDA, delay: quieto ? 0 : retraso }}
      style={{ height: `${altura}rem`, transformOrigin: "bottom" }}
      className={cn(
        "flex shrink-0 items-center justify-center first:rounded-b-[3px] last:rounded-t-[3px]",
        fondo,
      )}
    >
      <span className="tabular font-mono text-[0.7rem] leading-none text-white">{valor}</span>
    </motion.div>
  );
}
