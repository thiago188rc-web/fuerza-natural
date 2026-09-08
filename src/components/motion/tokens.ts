import type { Transition, Variants } from "motion/react";

/**
 * EL SISTEMA DE MOVIMIENTO. Cuatro duraciones, dos curvas, cinco
 * variantes. Todo lo que se mueve en NEXA sale de acá.
 *
 * Por qué tan poco: el movimiento es un lenguaje, y un lenguaje con
 * cincuenta palabras para "aparecer" no comunica nada. Cuando cada
 * pantalla inventa su propia curva, el producto se siente ensamblado por
 * gente distinta — que es exactamente la sensación que hay que evitar.
 *
 * Reglas:
 *   · Solo `transform` y `opacity`. Ambas las compone la GPU; animar
 *     width/height/top fuerza layout en cada frame y a 60fps se nota.
 *   · Nada dura más de 420ms. Esto es software de gestión: el dueño va a
 *     registrar veinte pagos seguidos, y una animación "linda" de 600ms
 *     se convierte en veinte segundos de espera.
 *   · Los desplazamientos son de 4 a 8px. Más que eso ya no es un matiz
 *     de foco, es una animación de sitio web.
 */

export const DURACION = {
  /** Hover, foco, cambios de color. Casi imperceptible, a propósito. */
  instantaneo: 0.12,
  /** Entrada de elementos chicos, tooltips, badges. */
  rapido: 0.18,
  /** El caballito de batalla: contenido, filas, tarjetas. */
  normal: 0.28,
  /** Overlays grandes y el instrumento del mes al montarse. */
  pausado: 0.42,
} as const;

/** Arranca rápido y desacelera largo: ágil sin verse apurado. */
export const SALIDA: Transition["ease"] = [0.22, 1, 0.36, 1];
/** Simétrica. Para lo que sale de pantalla, donde no hay que "aterrizar". */
export const ENTRADA: Transition["ease"] = [0.4, 0, 0.2, 1];

/** Resorte corto y sin rebote visible. Para overlays: se sienten físicos. */
export const RESORTE: Transition = {
  type: "spring",
  stiffness: 460,
  damping: 38,
  mass: 0.9,
};

/** Aparecer subiendo. La entrada por defecto de casi todo. */
export const APARECE: Variants = {
  oculto: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURACION.normal, ease: SALIDA } },
  saliendo: { opacity: 0, y: -4, transition: { duration: DURACION.rapido, ease: ENTRADA } },
};

/**
 * Contenedor de lista escalonada. El retraso es de 24ms y se corta a los
 * 10 elementos: una tabla de 200 alumnos no puede tardar 5 segundos en
 * terminar de aparecer. La cascada sugiere orden, no obliga a esperarla.
 */
export const LISTA: Variants = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.024, delayChildren: 0.02 } },
};

export const ITEM_LISTA: Variants = {
  oculto: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURACION.normal, ease: SALIDA } },
};

/** Overlays: escala mínima + resorte. Nunca desde 0.8, eso es un "pop". */
export const OVERLAY: Variants = {
  oculto: { opacity: 0, scale: 0.985, y: 4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: RESORTE },
  saliendo: {
    opacity: 0,
    scale: 0.99,
    y: 2,
    transition: { duration: DURACION.instantaneo, ease: ENTRADA },
  },
};
