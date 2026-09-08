"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

/**
 * Pestañas para revelar información de a poco.
 *
 * El contenido de TODAS las pestañas viene renderizado del servidor —los
 * datos ya están— y acá solo se decide cuál se muestra. Cambiar de
 * pestaña es instantáneo: no hay ida y vuelta, no hay spinner. Lo
 * inactivo queda con `hidden`, que lo saca del árbol de accesibilidad y
 * del foco por teclado sin tirar el DOM.
 *
 * El subrayado activo se DESLIZA de una pestaña a la otra (`layoutId`):
 * un solo objeto que se mueve, no dos que parpadean.
 */

interface Pestana {
  clave: string;
  etiqueta: string;
  /** Un conteo al lado de la etiqueta: "Pagos 11". */
  conteo?: number;
}

const Contexto = createContext<{
  activa: string;
  activar: (clave: string) => void;
  grupo: string;
} | null>(null);

function usePestanas() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("Este componente tiene que ir dentro de <Pestanas>.");
  return ctx;
}

export function Pestanas({ inicial, children }: { inicial: string; children: ReactNode }) {
  const [activa, activar] = useState(inicial);
  const grupo = useId();
  return <Contexto.Provider value={{ activa, activar, grupo }}>{children}</Contexto.Provider>;
}

export function ListaDePestanas({
  pestanas,
  className,
  etiqueta,
}: {
  pestanas: Pestana[];
  className?: string;
  etiqueta: string;
}) {
  const { activa, activar, grupo } = usePestanas();
  const quieto = useReducedMotion();

  return (
    <div
      role="tablist"
      aria-label={etiqueta}
      className={cn("flex items-end gap-1 border-b border-border", className)}
    >
      {pestanas.map((p) => {
        const esActiva = p.clave === activa;
        return (
          <button
            key={p.clave}
            type="button"
            role="tab"
            id={`${grupo}-tab-${p.clave}`}
            aria-selected={esActiva}
            aria-controls={`${grupo}-panel-${p.clave}`}
            tabIndex={esActiva ? 0 : -1}
            onClick={() => activar(p.clave)}
            onKeyDown={(e) => {
              // Flechas entre pestañas, como un tablist nativo.
              const i = pestanas.findIndex((x) => x.clave === activa);
              if (e.key === "ArrowRight") activar(pestanas[(i + 1) % pestanas.length]!.clave);
              if (e.key === "ArrowLeft")
                activar(pestanas[(i - 1 + pestanas.length) % pestanas.length]!.clave);
            }}
            className={cn(
              "relative -mb-px flex h-9 items-center gap-1.5 rounded-t-md px-2.5 text-[0.8125rem] transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none focus-visible:ring-inset",
              esActiva ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.etiqueta}
            {p.conteo !== undefined ? (
              <span
                // El espacio va en el texto y no solo en el `gap`: sin él,
                // el nombre accesible del tab se lee "Historial2".
                className={cn(
                  "tabular font-mono text-[0.7rem] before:content-['_']",
                  esActiva ? "text-muted-foreground" : "text-muted-foreground/60",
                )}
              >
                {p.conteo}
              </span>
            ) : null}
            {esActiva ? (
              <motion.span
                layoutId={quieto ? undefined : `pestana-${grupo}`}
                aria-hidden
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground"
                transition={{ duration: DURACION.rapido, ease: SALIDA }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function PanelDePestana({
  clave,
  children,
  className,
}: {
  clave: string;
  children: ReactNode;
  className?: string;
}) {
  const { activa, grupo } = usePestanas();
  const visible = activa === clave;

  // La entrada es una animación CSS y no un `motion.div` con key: los
  // keyframes se disparan cada vez que el panel pasa de `display: none` a
  // visible, sin remontar nada. Así el estado interno de las pestañas
  // —un "Ver más" desplegado, una confirmación en pantalla— sobrevive al
  // ir y volver.
  return (
    <div
      role="tabpanel"
      id={`${grupo}-panel-${clave}`}
      aria-labelledby={`${grupo}-tab-${clave}`}
      hidden={!visible}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-[var(--ease-salida)] motion-reduce:animate-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Un enlace interno que lleva a otra pestaña: "Ver los 11 pagos →". */
export function IrAPestana({
  clave,
  children,
  className,
}: {
  clave: string;
  children: ReactNode;
  className?: string;
}) {
  const { activar } = usePestanas();
  return (
    <button
      type="button"
      onClick={() => activar(clave)}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none",
        className,
      )}
    >
      {children}
    </button>
  );
}
