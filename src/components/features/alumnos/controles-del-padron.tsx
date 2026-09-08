"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Loader2, Search, X } from "lucide-react";
import { etiquetaVinculo, VINCULOS } from "@/domain/alumnos/vinculo";
import { ESTADO_FILTRO_TODOS } from "@/schemas/student";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

/**
 * Búsqueda y filtro del padrón. El estado real vive en la URL, no en
 * React: así se puede volver atrás, recargar, o guardarse el link a "los
 * pausados" y encontrar lo mismo.
 *
 * La búsqueda navega sola, 260ms después de la última tecla. Es un cambio
 * respecto de Fase 1, que exigía Enter o apretar "Buscar", y la razón es
 * concreta: buscar es lo que más se hace en esta pantalla, y un botón
 * intermedio convierte cada búsqueda en dos acciones. El indicador de
 * carga aparece SOLO mientras la transición está pendiente, así que la
 * lista nunca parpadea entre resultados — React mantiene visible la
 * anterior hasta que llega la nueva.
 */

const FILTROS = [
  { valor: ESTADO_FILTRO_TODOS, etiqueta: "Todos" },
  ...VINCULOS.map((v) => ({ valor: v, etiqueta: `${etiquetaVinculo(v)}s` })),
];

const RETRASO_DE_BUSQUEDA = 260;

export function ControlesDelPadron({
  q,
  estado,
  conteo,
  total,
}: {
  q: string;
  estado: string;
  conteo: Record<string, number>;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const quieto = useReducedMotion();
  const [termino, setTermino] = useState(q);
  const [pendiente, iniciarTransicion] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navegar(nuevoTermino: string, nuevoEstado: string) {
    const params = new URLSearchParams();
    if (nuevoTermino.trim()) params.set("q", nuevoTermino.trim());
    if (nuevoEstado !== ESTADO_FILTRO_TODOS) params.set("estado", nuevoEstado);
    // Cualquier cambio de filtro vuelve a la página 1: quedarse en la 4 de
    // un resultado que ahora tiene 2 páginas muestra una lista vacía.
    const query = params.toString();
    iniciarTransicion(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  function alEscribir(valor: string) {
    setTermino(valor);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => navegar(valor, estado), RETRASO_DE_BUSQUEDA);
  }

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  function cantidad(valor: string): number {
    if (valor === ESTADO_FILTRO_TODOS) return total;
    return conteo[valor] ?? 0;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* El filtro como pestañas, no como desplegable: son cuatro opciones
          fijas y el conteo de cada una es información que conviene tener a
          la vista, no escondida detrás de un clic. */}
      <div
        role="tablist"
        aria-label="Filtrar por estado"
        className="flex items-center gap-0.5 self-start rounded-lg bg-muted p-0.5"
      >
        {FILTROS.map((filtro) => {
          const activo = filtro.valor === estado;
          return (
            <button
              key={filtro.valor}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => navegar(termino, filtro.valor)}
              className={cn(
                "relative rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-sm transition-colors duration-150",
                "focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none",
                activo ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {activo ? (
                <motion.span
                  layoutId={quieto ? undefined : "filtro-padron"}
                  className="absolute inset-0 rounded-[calc(var(--radius)-2px)] bg-card shadow-[0_1px_2px_oklch(0_0_0/0.07)] ring-1 ring-border"
                  transition={{ duration: DURACION.rapido, ease: SALIDA }}
                />
              ) : null}
              <span className="relative flex items-center gap-1.5">
                {filtro.etiqueta}
                <span
                  className={cn(
                    "tabular font-mono text-[0.7rem]",
                    activo ? "text-muted-foreground" : "text-muted-foreground/60",
                  )}
                >
                  {cantidad(filtro.valor)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative w-full sm:max-w-xs">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={2}
        />
        <input
          type="search"
          value={termino}
          onChange={(e) => alEscribir(e.target.value)}
          placeholder="Buscar por nombre o apellido…"
          aria-label="Buscar alumnos por nombre o apellido"
          className="h-9 w-full rounded-lg border border-border bg-card pr-9 pl-9 text-sm transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-verde focus-visible:ring-2 focus-visible:ring-verde/25 focus-visible:outline-none"
        />
        <span className="absolute top-1/2 right-2.5 -translate-y-1/2">
          {pendiente ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" strokeWidth={2} />
          ) : termino ? (
            <button
              type="button"
              aria-label="Limpiar la búsqueda"
              onClick={() => {
                setTermino("");
                navegar("", estado);
              }}
              className="grid size-5 place-items-center rounded text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}
