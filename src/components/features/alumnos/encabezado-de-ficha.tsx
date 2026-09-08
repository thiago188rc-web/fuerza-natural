"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import type { EstadoDeCobertura } from "@/domain/pagos/cobertura";
import { Senal, TEXTO_DE_ESTADO } from "@/components/features/cobertura/senal";
import { OVERLAY } from "@/components/motion/tokens";
import { iniciales } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * El encabezado de la ficha: quién es y en qué situación está. Las dos
 * etiquetas —vínculo y cobertura— van pegadas pero separadas por un
 * punto medio, no fundidas en un solo "estado". Son conceptos distintos
 * y la ficha es el lugar donde eso tiene que quedar más claro que en
 * ningún otro.
 */
export function EncabezadoDeFicha({
  nombre,
  apellido,
  vinculo,
  etiquetaVinculo,
  estado,
  detalle,
  plan,
}: {
  nombre: string;
  apellido: string;
  vinculo: string;
  etiquetaVinculo: string;
  estado: EstadoDeCobertura;
  detalle: string;
  plan: string;
}) {
  const activo = vinculo === "ACTIVO";

  return (
    <div className="flex items-center gap-4">
      {/* Iniciales sobre hairline. Sin relleno de color: el color en este
          producto significa cobertura, y un avatar pintado se leería como
          un estado. */}
      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-full font-mono text-sm ring-1",
          activo ? "text-foreground ring-border-strong" : "text-muted-foreground ring-border",
        )}
      >
        {iniciales(nombre, apellido)}
      </span>

      <div className="min-w-0">
        <h1 className="t-titulo text-[1.5rem] sm:text-[1.75rem]">
          {nombre} {apellido}
        </h1>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem]">
          <span className={cn(activo ? "text-muted-foreground" : "font-medium text-foreground")}>
            {etiquetaVinculo}
          </span>
          <span aria-hidden className="text-border-strong">
            ·
          </span>
          <span className="text-muted-foreground">{plan}</span>
          <span aria-hidden className="text-border-strong">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Senal estado={estado} />
            <span className={TEXTO_DE_ESTADO[estado]}>{detalle}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * El aviso de "listo". Aparece con un resorte corto y se queda: no
 * desaparece solo. Un mensaje de confirmación que se esfuma a los tres
 * segundos es un mensaje que la mitad de la gente no llega a leer.
 */
export function AvisoDeExito({ texto }: { texto: string }) {
  const quieto = useReducedMotion();

  return (
    <motion.p
      role="status"
      initial={quieto ? false : "oculto"}
      animate="visible"
      variants={OVERLAY}
      className="flex items-center gap-2 rounded-lg border border-cubierto/25 bg-cubierto-suave px-3 py-2 text-sm text-cubierto"
    >
      <Check className="size-4 shrink-0" strokeWidth={2.25} />
      {texto}
    </motion.p>
  );
}
