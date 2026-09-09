"use client";

import { useState, useTransition } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import type { AlumnoParaAsistencia } from "@/use-cases/asistencias/consultas";
import { marcarAsistencia, desmarcarAsistencia } from "@/app/(app)/asistencias/actions";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { iniciales } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * LISTA DE HOY. Un toque marca presente; otro toque lo deshace — no hay
 * "guardar", cada fila se confirma sola. El estado optimista cambia antes
 * de que vuelva el servidor; si la respuesta falla, se revierte.
 */
export function ListaDeAsistencia({ alumnos }: { alumnos: AlumnoParaAsistencia[] }) {
  const quieto = useReducedMotion();
  const [estado, setEstado] = useState(() => new Map(alumnos.map((a) => [a.id, a.presente])));
  const [pendientes, setPendientes] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function alternar(id: string) {
    const presenteAhora = estado.get(id) ?? false;
    setEstado((prev) => new Map(prev).set(id, !presenteAhora));
    setPendientes((prev) => new Set(prev).add(id));

    startTransition(async () => {
      const resultado = presenteAhora ? await desmarcarAsistencia(id) : await marcarAsistencia(id);
      if (!resultado.ok) {
        // Revertir: la escritura no se confirmó del lado del servidor.
        setEstado((prev) => new Map(prev).set(id, presenteAhora));
      }
      setPendientes((prev) => {
        const siguiente = new Set(prev);
        siguiente.delete(id);
        return siguiente;
      });
    });
  }

  return (
    <ul className="divide-y divide-border">
      {alumnos.map((alumno, i) => {
        const presente = estado.get(alumno.id) ?? false;
        const ocupado = pendientes.has(alumno.id);

        return (
          <motion.li
            key={alumno.id}
            initial={quieto || i > 20 ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: DURACION.rapido,
              ease: SALIDA,
              delay: quieto ? 0 : Math.min(i, 20) * 0.012,
            }}
            className="flex items-center gap-3 px-4 py-3 sm:px-5"
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full font-mono text-[0.68rem] ring-1 transition-colors duration-150",
                presente ? "bg-cubierto-suave text-cubierto ring-transparent" : "text-muted-foreground ring-border",
              )}
            >
              {iniciales(alumno.nombre, alumno.apellido)}
            </span>

            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {alumno.apellido}, {alumno.nombre}
            </span>

            <button
              type="button"
              onClick={() => alternar(alumno.id)}
              disabled={ocupado}
              aria-pressed={presente}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none disabled:opacity-60",
                presente
                  ? "border-transparent bg-cubierto-suave text-cubierto hover:bg-cubierto-suave/70"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {ocupado ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : presente ? (
                <Check className="size-3.5" strokeWidth={2.25} />
              ) : null}
              {presente ? "Presente" : "Marcar"}
            </button>
          </motion.li>
        );
      })}
    </ul>
  );
}
