"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import type { AlumnoEnAtencion } from "@/use-cases/panel/consultas";
import { BarraDeCobertura } from "@/components/features/cobertura/instrumento-del-mes";
import { TEXTO_DE_ESTADO } from "@/components/features/cobertura/senal";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { iniciales } from "@/lib/formato";
import { cn } from "@/lib/utils";

const VISIBLES_AL_PRINCIPIO = 8;

/**
 * LA BANDEJA — una inbox operativa, no una tabla de morosos.
 *
 * La diferencia entre las dos está en tres decisiones:
 *
 *   1. SE AGRUPA POR GRAVEDAD. "Sin cubrir" arriba, "para revisar" abajo,
 *      cada grupo con su cabecera y su conteo. El dueño no lee una lista:
 *      lee "seis problemas y trece avisos".
 *
 *   2. CADA FILA ES UNA TAREA. Persona, situación, contexto (plan,
 *      teléfono, la cobertura real del mes dibujada) y LA ACCIÓN al lado
 *      del problema. Toda la fila lleva a cobrar; el nombre lleva a la
 *      ficha. Dos destinos, dos enlaces reales —no un onClick con
 *      `stopPropagation`—, así Ctrl+clic y el teclado siguen funcionando.
 *
 *   3. LA ACCIÓN APARECE CUANDO LA FILA SE TOCA. En reposo la lista es
 *      información; al pasar el mouse o llegar con Tab, el botón "Cobrar"
 *      entra deslizándose 4px. El sistema le está diciendo al usuario
 *      "esto es lo que hay que hacer con esta persona" en el momento en
 *      que la mira.
 */
export function BandejaDeAtencion({
  alumnos,
  posicionDeHoy,
  etiquetaMes,
}: {
  alumnos: AlumnoEnAtencion[];
  posicionDeHoy: number;
  etiquetaMes: string;
}) {
  const quieto = useReducedMotion();
  const [expandida, setExpandida] = useState(false);

  const visibles = expandida ? alumnos : alumnos.slice(0, VISIBLES_AL_PRINCIPIO);
  const restantes = alumnos.length - visibles.length;

  if (alumnos.length === 0) {
    return (
      <section className="superficie flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-cubierto-suave text-cubierto">
          <Check className="size-4.5" strokeWidth={2.25} />
        </span>
        <h2 className="t-seccion mt-4">No hay pagos para revisar</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Todos los alumnos activos tienen {etiquetaMes.split(" ")[0]} cubierto. Cuando alguien
          quede sin cobertura, va a aparecer acá.
        </p>
      </section>
    );
  }

  // Grupos en orden de gravedad. `visibles` ya viene ordenado así desde el
  // servidor; acá solo se le ponen las cabeceras.
  const grupos = [
    { estado: "DESCUBIERTO" as const, titulo: "Sin cubrir" },
    { estado: "REVISAR" as const, titulo: "Para revisar" },
  ]
    .map((g) => ({ ...g, filas: visibles.filter((a) => a.estado === g.estado) }))
    .filter((g) => g.filas.length > 0);

  const totales = {
    DESCUBIERTO: alumnos.filter((a) => a.estado === "DESCUBIERTO").length,
    REVISAR: alumnos.filter((a) => a.estado === "REVISAR").length,
  };

  return (
    <section className="superficie overflow-hidden" aria-label="Alumnos que requieren atención">
      <header className="flex items-baseline justify-between gap-4 px-5 pt-4 pb-3">
        <h2 className="t-seccion">Requieren atención</h2>
        <p className="tabular font-mono text-xs text-muted-foreground">
          <span className="text-foreground">{alumnos.length}</span>{" "}
          {alumnos.length === 1 ? "alumno" : "alumnos"}
        </p>
      </header>

      {grupos.map((grupo) => (
        <div key={grupo.estado}>
          <div className="hundido flex items-center gap-2 border-y border-border px-5 py-1.5">
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-[1.5px]",
                grupo.estado === "DESCUBIERTO" ? "bg-descubierto" : "bg-revisar",
              )}
            />
            <h3 className="t-rotulo">{grupo.titulo}</h3>
            <span className="tabular ml-auto font-mono text-[0.7rem] text-muted-foreground">
              {totales[grupo.estado]}
            </span>
          </div>

          <ul className="divide-y divide-border">
            <AnimatePresence initial={false}>
              {grupo.filas.map((alumno) => {
                const i = visibles.indexOf(alumno);
                return (
                  <motion.li
                    key={alumno.id}
                    layout={!quieto}
                    initial={quieto || i < VISIBLES_AL_PRINCIPIO ? false : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={quieto ? undefined : { opacity: 0 }}
                    transition={{
                      duration: DURACION.normal,
                      ease: SALIDA,
                      delay: quieto ? 0 : Math.min(6, i - VISIBLES_AL_PRINCIPIO) * 0.024,
                    }}
                    className="fila group"
                  >
                    <Fila alumno={alumno} posicionDeHoy={posicionDeHoy} />
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      ))}

      {restantes > 0 ? (
        <button
          type="button"
          onClick={() => setExpandida(true)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
        >
          Ver {restantes} más
          <ChevronDown className="size-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </section>
  );
}

/**
 * Una fila. El enlace "Cobrar" se ESTIRA sobre la fila entera con un
 * `::after` (`after:absolute after:inset-0`): así toda la superficie
 * lleva a cobrar sin envolver la fila en un `<a>` —que no admitiría el
 * segundo enlace, el del nombre—. El nombre queda por encima con
 * `relative z-10` y sigue siendo su propio enlace.
 */
function Fila({ alumno, posicionDeHoy }: { alumno: AlumnoEnAtencion; posicionDeHoy: number }) {
  const nombre = `${alumno.nombre} ${alumno.apellido}`;

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-5 py-3 sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_auto]">
      <span className="grid size-8 shrink-0 place-items-center rounded-full font-mono text-[0.68rem] text-muted-foreground ring-1 ring-border transition-colors duration-150 group-hover:text-foreground">
        {iniciales(alumno.nombre, alumno.apellido)}
      </span>

      <span className="min-w-0">
        <Link
          href={`/alumnos/${alumno.id}`}
          className="relative z-10 block w-fit max-w-full truncate text-sm font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
        >
          {nombre}
        </Link>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {alumno.planNombre}
          {alumno.telefono ? (
            <>
              <span className="mx-1.5 text-border-strong">·</span>
              <span className="tabular">{alumno.telefono}</span>
            </>
          ) : null}
        </span>
      </span>

      {/* La cobertura real del mes. En pantalla chica se corre debajo del
          nombre en vez de desaparecer: es el dato, no un adorno. */}
      <span className="col-span-2 col-start-2 min-w-0 sm:col-span-1 sm:col-start-3">
        <BarraDeCobertura
          segmentos={alumno.segmentos}
          posicionDeHoy={posicionDeHoy}
          estado={alumno.estado}
          titulo={`${nombre}: ${alumno.detalle}`}
        />
        <span className={cn("mt-1.5 block truncate text-xs", TEXTO_DE_ESTADO[alumno.estado])}>
          {alumno.detalle}
        </span>
      </span>

      {/* LA ACCIÓN. Estirada sobre la fila (`after:inset-0`) y visible
          como botón solo al tocar la fila. */}
      <Link
        href={`/pagos/nuevo?alumno=${alumno.id}`}
        aria-label={`Cobrarle a ${nombre}`}
        className={cn(
          "col-start-3 row-start-1 self-center sm:col-start-4",
          "after:absolute after:inset-0 after:content-['']",
          "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground",
          "translate-x-1 opacity-0 transition-[opacity,transform,background-color,border-color] duration-150 ease-[var(--ease-salida)]",
          "group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100",
          "hover:border-foreground hover:bg-foreground hover:text-background focus-visible:translate-x-0 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none",
        )}
      >
        Cobrar
        <ArrowRight className="size-3" strokeWidth={2.25} />
      </Link>
    </div>
  );
}
