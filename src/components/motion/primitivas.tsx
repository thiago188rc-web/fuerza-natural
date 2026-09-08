"use client";

import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { APARECE, DURACION, ITEM_LISTA, LISTA, SALIDA } from "./tokens";
import { cn } from "@/lib/utils";

/**
 * Las cuatro piezas de movimiento que usa el resto del producto. Ninguna
 * pantalla llama a `motion.div` con variantes propias: si hace falta un
 * comportamiento nuevo, se agrega acá y se usa en todos lados.
 *
 * Todas respetan `prefers-reduced-motion` vía `useReducedMotion()`: con la
 * preferencia activada renderizan el estado final sin transición. El CSS
 * global también neutraliza las transiciones, pero eso no alcanza para
 * animaciones manejadas por JavaScript.
 */

/** Entrada estándar: aparece subiendo 6px. */
export function Aparece({
  children,
  className,
  retraso = 0,
}: {
  children: ReactNode;
  className?: string;
  retraso?: number;
}) {
  const quieto = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={quieto ? false : "oculto"}
      animate="visible"
      variants={APARECE}
      transition={{ duration: DURACION.normal, ease: SALIDA, delay: retraso }}
    >
      {children}
    </motion.div>
  );
}

/** Contenedor de cascada. Sus hijos directos deben ser `<ItemLista>`. */
export function ListaEscalonada({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const quieto = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={quieto ? false : "oculto"}
      animate="visible"
      variants={LISTA}
    >
      {children}
    </motion.div>
  );
}

export function ItemLista({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={ITEM_LISTA}>
      {children}
    </motion.div>
  );
}

/**
 * Número que cuenta hasta su valor al entrar en pantalla.
 *
 * Existe por una razón concreta, no por adorno: un número que se anima
 * obliga al ojo a mirarlo. En un panel donde el dueño busca "cuántos
 * están sin cubrir", eso dirige la atención a la cifra correcta. Por eso
 * se usa SOLO en las métricas del panel y nunca en una tabla —
 * cincuenta números contando a la vez es ruido, no jerarquía.
 *
 * Cuenta desde que se MONTA, no desde que entra en pantalla. La versión
 * con `useInView` dejaba en 0 cualquier número que quedara abajo del
 * pliegue hasta que el usuario llegara ahí — y un 0 en un panel de
 * gestión no es una animación pendiente, es un dato equivocado.
 */
export function NumeroAnimado({
  valor,
  className,
  duracion = 0.9,
}: {
  valor: number;
  className?: string;
  duracion?: number;
}) {
  const quieto = useReducedMotion();
  const resorte = useSpring(0, { duration: duracion * 1000, bounce: 0 });
  const mostrado = useTransform(resorte, (v) => Math.round(v).toLocaleString("es-AR"));

  useEffect(() => {
    resorte.set(valor);
  }, [valor, resorte]);

  if (quieto) {
    return <span className={cn("tabular", className)}>{valor.toLocaleString("es-AR")}</span>;
  }

  return <motion.span className={cn("tabular", className)}>{mostrado}</motion.span>;
}

/**
 * Barra de progreso que crece desde la izquierda con `scaleX`.
 *
 * `scaleX` y no `width`: cambiar el ancho fuerza a recalcular layout en
 * cada frame; escalar lo resuelve la GPU. `transform-origin: left` es lo
 * que hace que crezca desde el borde en vez de expandirse desde el centro.
 */
export function BarraProgreso({
  porcentaje,
  className,
  colorClassName = "bg-foreground",
  retraso = 0,
}: {
  porcentaje: number;
  className?: string;
  colorClassName?: string;
  retraso?: number;
}) {
  const quieto = useReducedMotion();
  const proporcion = Math.max(0, Math.min(100, porcentaje)) / 100;

  return (
    <div className={cn("relative h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <motion.div
        className={cn("h-full origin-left rounded-full", colorClassName)}
        initial={quieto ? { scaleX: proporcion } : { scaleX: 0 }}
        animate={{ scaleX: proporcion }}
        transition={{ duration: DURACION.pausado, ease: SALIDA, delay: retraso }}
        style={{ width: "100%" }}
      />
    </div>
  );
}
