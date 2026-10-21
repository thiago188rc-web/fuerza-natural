"use client";

import { useActionState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Loader2, Plus } from "lucide-react";
import type { MotivoDeBaja } from "@/use-cases/gimnasio/contexto";
import { agregarMotivoDeBajaFormAction } from "@/app/(app)/configuracion/actions";
import { ESTADO_FORMULARIO_INICIAL } from "@/app/(app)/alumnos/estado-formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DURACION, SALIDA } from "@/components/motion/tokens";

/**
 * El catálogo de motivos de baja, con un alta simple al final: solo
 * agregar. No hay edición ni borrado porque no se pidió, y un motivo que
 * ya quedó guardado en una baja vieja no puede desaparecer del catálogo.
 */
export function FormularioDeMotivos({ motivos }: { motivos: MotivoDeBaja[] }) {
  const quieto = useReducedMotion();
  const [estado, agregar, agregando] = useActionState(
    agregarMotivoDeBajaFormAction,
    ESTADO_FORMULARIO_INICIAL,
  );

  return (
    <section className="superficie overflow-hidden">
      <header className="border-b border-border px-5 py-4">
        <h2 className="t-seccion">Motivos de baja</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Las opciones que aparecen al dar de baja a un alumno. Se guardan con la baja para poder
          entender después por qué se va la gente.
        </p>
      </header>

      <ul className="flex flex-wrap gap-1.5 px-5 py-4">
        {motivos
          .filter((m) => m.activo !== false)
          .map((motivo) => (
            <li
              key={motivo.codigo}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground"
            >
              {motivo.etiqueta}
            </li>
          ))}
      </ul>

      <form action={agregar} className="flex flex-wrap items-end gap-3 border-t border-border px-5 py-3.5">

        <div className="min-w-[14rem] flex-1">
          <Input
            name="etiqueta"
            placeholder="Ej: Viaje"
            maxLength={60}
            aria-label="Nuevo motivo de baja"
            aria-invalid={Boolean(estado.errores?.etiqueta)}
          />
          {estado.errores?.etiqueta ? (
            <p className="mt-1.5 text-xs text-destructive">{estado.errores.etiqueta}</p>
          ) : null}
        </div>

        <Button type="submit" variant="outline" disabled={agregando}>
          {agregando ? <Loader2 className="animate-spin" /> : <Plus />}
          Agregar motivo
        </Button>

        <div className="basis-full min-h-5 text-xs">
          <AnimatePresence mode="wait" initial={false}>
            {estado.mensaje && !estado.errores ? (
              <motion.p
                key={estado.mensaje}
                initial={quieto ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={quieto ? undefined : { opacity: 0 }}
                transition={{ duration: DURACION.rapido, ease: SALIDA }}
                className={estado.ok ? "flex items-center gap-1.5 text-cubierto" : "text-destructive"}
                role="status"
              >
                {estado.ok ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                {estado.mensaje}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </form>
    </section>
  );
}
