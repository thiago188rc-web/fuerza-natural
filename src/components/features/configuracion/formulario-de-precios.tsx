"use client";

import { useActionState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import type { PlanDelGimnasio } from "@/use-cases/gimnasio/contexto";
import { guardarPreciosFormAction } from "@/app/(app)/configuracion/actions";
import { ESTADO_FORMULARIO_INICIAL } from "@/app/(app)/alumnos/estado-formulario";
import { Button } from "@/components/ui/button";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { numero } from "@/lib/formato";

/**
 * PRECIOS. La pantalla que convierte "los precios son datos, no código"
 * en algo que el dueño puede comprobar.
 *
 * Un campo vacío significa "todavía no confirmado" y se guarda como NULL,
 * no como 0. Es la diferencia entre "no sé cuánto sale" y "es gratis", y
 * el formulario de cobro las trata distinto: con NULL pide el importe a
 * mano en vez de autocompletar un número inventado.
 */
export function FormularioDePrecios({
  planes,
  precioMedioMes,
}: {
  planes: PlanDelGimnasio[];
  precioMedioMes: number | null;
}) {
  const quieto = useReducedMotion();
  const [estado, guardar, guardando] = useActionState(
    guardarPreciosFormAction,
    ESTADO_FORMULARIO_INICIAL,
  );

  return (
    <form action={guardar} className="superficie overflow-hidden">
      <header className="border-b border-border px-5 py-4">
        <h2 className="t-seccion">Precios</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cambiar un precio afecta a los cobros de acá en adelante.{" "}
          <strong className="font-medium text-foreground">
            Los pagos ya registrados no se tocan
          </strong>{" "}
          — cada uno guarda el importe con el que se cobró.
        </p>
      </header>

      <ul className="divide-y divide-border">
        {planes.map((plan) => (
          <li key={plan.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{plan.nombre}</span>
              <span className="block text-xs text-muted-foreground">
                {plan.acceso === "LIBRE"
                  ? `Acceso libre · ${plan.diasSemana} días o más por semana, incluye sábados`
                  : `${plan.diasSemana} días por semana`}
              </span>
            </span>

            <CampoDePrecio
              nombre={`precio:${plan.id}`}
              defaultValue={plan.precio}
              etiqueta={`Precio de ${plan.nombre}`}
            />
          </li>
        ))}

        <li className="hundido flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">1/2 mes</span>
            <span className="block text-xs text-muted-foreground">
              15 días corridos desde cualquier día. Es una modalidad de cobro, no un plan: no se le
              puede asignar a un alumno.
            </span>
          </span>

          <CampoDePrecio
            nombre="precioMedioMes"
            defaultValue={precioMedioMes}
            etiqueta="Precio de 1/2 mes"
          />
        </li>
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <div className="min-h-5 text-xs">
          <AnimatePresence mode="wait" initial={false}>
            {estado.mensaje ? (
              <motion.p
                key={estado.mensaje}
                initial={quieto ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={quieto ? undefined : { opacity: 0 }}
                transition={{ duration: DURACION.rapido, ease: SALIDA }}
                className={
                  estado.ok
                    ? "flex items-center gap-1.5 text-cubierto"
                    : "text-destructive"
                }
                role="status"
              >
                {estado.ok ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                {estado.mensaje}
              </motion.p>
            ) : (
              <motion.p
                key="ayuda"
                initial={false}
                className="text-muted-foreground"
              >
                Dejá un campo vacío si el precio todavía no está confirmado.
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <Button type="submit" disabled={guardando}>
          {guardando ? (
            <>
              <Loader2 className="animate-spin" />
              Guardando…
            </>
          ) : (
            "Guardar precios"
          )}
        </Button>
      </footer>
    </form>
  );
}

function CampoDePrecio({
  nombre,
  defaultValue,
  etiqueta,
}: {
  nombre: string;
  defaultValue: number | null;
  etiqueta: string;
}) {
  return (
    <span className="relative w-36 shrink-0">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm text-muted-foreground">
        $
      </span>
      <input
        type="text"
        inputMode="numeric"
        name={nombre}
        aria-label={etiqueta}
        // Con separador de miles: un importe agrupado de a tres se lee de
        // un vistazo y una tira de dígitos no. El servidor saca los puntos
        // antes de convertir, así que escribirlo de cualquiera de las dos
        // formas funciona.
        defaultValue={defaultValue === null ? "" : numero(defaultValue)}
        placeholder="Sin confirmar"
        className="tabular h-9 w-full rounded-lg border border-border bg-card pr-3 pl-7 text-right font-mono text-sm transition-colors duration-150 placeholder:font-sans placeholder:text-xs placeholder:text-muted-foreground/70 focus-visible:border-verde focus-visible:ring-2 focus-visible:ring-verde/25 focus-visible:outline-none"
      />
    </span>
  );
}
