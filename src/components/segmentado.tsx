"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

/**
 * Control segmentado con indicador deslizante.
 *
 * Por dentro son `<input type="radio">` reales, visualmente ocultos, con
 * un `<label>` encima. No es purismo: los radios nativos ya traen
 * navegación con flechas, agrupación por `name`, anuncio correcto en
 * lectores de pantalla y —lo más práctico— el valor viaja solo en el
 * `FormData` de la Server Action. Reimplementar eso con `<button>` es
 * garantizarse la mitad de esos comportamientos.
 *
 * Lo único que agrega el JavaScript es el rectángulo que se DESLIZA entre
 * opciones (`layoutId`). Es la microinteracción que hace que elegir una
 * modalidad se sienta física en vez de un parpadeo de clases.
 */

export interface OpcionSegmentada<T extends string> {
  valor: T;
  etiqueta: string;
  /** Segunda línea, opcional: para explicar qué implica la opción. */
  detalle?: string;
}

export function Segmentado<T extends string>({
  nombre,
  valor,
  onCambio,
  opciones,
  className,
  size = "normal",
}: {
  nombre: string;
  valor: T;
  onCambio: (valor: T) => void;
  opciones: readonly OpcionSegmentada<T>[];
  className?: string;
  size?: "normal" | "compacto";
}) {
  const quieto = useReducedMotion();
  const grupo = useId();

  return (
    <div
      className={cn("grid gap-1 rounded-lg bg-muted p-1", className)}
      // Inline y no una clase de Tailwind: la cantidad de columnas depende
      // de cuántas opciones reciba, y Tailwind no puede ver una clase
      // construida en tiempo de ejecución.
      style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}
    >
      {opciones.map((opcion) => {
        const activo = opcion.valor === valor;
        const id = `${grupo}-${opcion.valor}`;

        return (
          <div key={opcion.valor} className="relative">
            {/*
             * El input NO está escondido en un rincón de 1px (`sr-only`):
             * cubre la celda entera, transparente. La diferencia importa —
             * con `sr-only` el único blanco real es el `<label>`, y todo lo
             * que apunte al control en sí (una automatización, un test, un
             * lector con navegación por objetos) le erra por completo.
             * Acá el blanco y el control son la misma cosa.
             */}
            <input
              type="radio"
              id={id}
              name={nombre}
              value={opcion.valor}
              checked={activo}
              onChange={() => onCambio(opcion.valor)}
              className="peer absolute inset-0 cursor-pointer appearance-none rounded-[calc(var(--radius)-2px)] opacity-0 outline-none"
            />
            {activo ? (
              <motion.span
                layoutId={quieto ? undefined : `segmentado-${grupo}`}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-[calc(var(--radius)-2px)] bg-card shadow-[0_1px_2px_oklch(0_0_0/0.07)] ring-1 ring-border"
                transition={{ duration: DURACION.rapido, ease: SALIDA }}
              />
            ) : null}
            {/* El texto es la etiqueta accesible del radio, y nada más: los
                clicks lo atraviesan y llegan al input que está debajo. */}
            <label
              htmlFor={id}
              className={cn(
                "pointer-events-none relative flex flex-col items-center justify-center rounded-[calc(var(--radius)-2px)] text-center transition-colors duration-150",
                "peer-hover:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-verde peer-focus-visible:outline-none",
                size === "compacto" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
                activo ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {opcion.etiqueta}
              {opcion.detalle ? (
                <span className="mt-0.5 text-[0.7rem] leading-tight font-normal text-muted-foreground">
                  {opcion.detalle}
                </span>
              ) : null}
            </label>
          </div>
        );
      })}
    </div>
  );
}
