"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { claveDeMes, etiquetaDeMes, primerDiaDelMes, sumarMeses } from "@/domain/fechas/calendario";
import { DURACION, SALIDA } from "@/components/motion/tokens";

/**
 * Navegación por mes. El mes vive en la URL (`?mes=2026-09`), no en
 * estado del cliente: así se puede compartir el enlace, volver atrás con
 * el navegador y recargar sin perder dónde estabas.
 *
 * La etiqueta entra deslizándose en la dirección del movimiento — hacia la
 * izquierda si vas al mes siguiente, hacia la derecha si volvés. Es una
 * pista de dirección, no un adorno: hace que el cambio se lea como
 * desplazarse por una línea de tiempo y no como que se reemplazó el texto.
 */
export function NavegadorDeMes({
  mes,
  /** No se puede avanzar más allá del mes de hoy. */
  maximo,
}: {
  mes: string;
  maximo: string;
}) {
  const router = useRouter();
  const quieto = useReducedMotion();

  const clave = claveDeMes(mes);
  const haySiguiente = claveDeMes(mes) < claveDeMes(maximo);

  function ir(meses: number) {
    const destino = primerDiaDelMes(sumarMeses(mes, meses));
    router.push(`?mes=${claveDeMes(destino)}`, { scroll: false });
  }

  return (
    <div className="flex items-center gap-1">
      <Paso etiqueta="Mes anterior" onClick={() => ir(-1)}>
        <ChevronLeft className="size-4" strokeWidth={2} />
      </Paso>

      <div className="relative min-w-[9.5rem] overflow-hidden text-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={clave}
            initial={quieto ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={quieto ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: DURACION.rapido, ease: SALIDA }}
            className="block font-heading text-sm font-semibold capitalize"
          >
            {etiquetaDeMes(mes)}
          </motion.span>
        </AnimatePresence>
      </div>

      <Paso etiqueta="Mes siguiente" onClick={() => ir(1)} deshabilitado={!haySiguiente}>
        <ChevronRight className="size-4" strokeWidth={2} />
      </Paso>
    </div>
  );
}

function Paso({
  children,
  etiqueta,
  onClick,
  deshabilitado,
}: {
  children: React.ReactNode;
  etiqueta: string;
  onClick: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}
