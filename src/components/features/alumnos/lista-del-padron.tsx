"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";
import type { FilaDelPadron } from "@/use-cases/alumnos/padron";
import { BarraDeCobertura } from "@/components/features/cobertura/instrumento-del-mes";
import { TEXTO_DE_ESTADO } from "@/components/features/cobertura/senal";
import { esVinculo, etiquetaVinculo } from "@/domain/alumnos/vinculo";
import { distanciaRelativa } from "@/domain/fechas/calendario";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { iniciales } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * EL PADRÓN.
 *
 * Cada fila mantiene separadas las dos cosas que este sistema no confunde
 * nunca: el VÍNCULO (activo, pausado, baja — un estado que solo cambia por
 * decisión humana) y la SITUACIÓN DE PAGO (derivada, distinta cada día).
 * Están en columnas distintas y con tratamiento visual distinto a
 * propósito: el vínculo es texto, la cobertura es un riel.
 *
 * A un alumno pausado o dado de baja no se le muestra situación de pago.
 * No es que "esté al día": es que la pregunta no aplica.
 */
/** El vínculo viene como `string` de la base; acá se muestra o se deja tal cual. */
function etiqueta(vinculo: string): string {
  return esVinculo(vinculo) ? etiquetaVinculo(vinculo) : vinculo;
}

export function ListaDelPadron({
  filas,
  posicionDeHoy,
  hoy,
}: {
  filas: FilaDelPadron[];
  posicionDeHoy: number;
  hoy: string;
}) {
  const quieto = useReducedMotion();

  return (
    <ul className="divide-y divide-border">
      {filas.map((alumno, i) => {
        const activo = alumno.vinculo === "ACTIVO";

        return (
          <motion.li
            key={alumno.id}
            initial={quieto || i > 14 ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: DURACION.rapido,
              ease: SALIDA,
              delay: quieto ? 0 : Math.min(i, 14) * 0.018,
            }}
            className="fila group"
          >
            <Link
              href={`/alumnos/${alumno.id}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3 outline-none sm:px-5 lg:grid-cols-[auto_minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto]"
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full font-mono text-[0.68rem] ring-1 transition-colors duration-150",
                  activo
                    ? "text-muted-foreground ring-border group-hover:text-foreground"
                    : "text-muted-foreground/70 ring-border",
                )}
              >
                {iniciales(alumno.nombre, alumno.apellido)}
              </span>

              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-sm font-medium",
                    !activo && "text-muted-foreground",
                  )}
                >
                  {alumno.apellido}, {alumno.nombre}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {alumno.planNombre}
                  {alumno.telefono ? ` · ${alumno.telefono}` : ""}
                </span>
              </span>

              {/* VÍNCULO. Sin píldora de color: el color en este sistema
                  significa situación de pago, y usarlo también acá haría
                  que dos cosas distintas se leyeran igual. */}
              <span className="col-start-2 row-start-2 min-w-0 lg:col-start-3 lg:row-start-1">
                <span
                  className={cn(
                    "text-xs",
                    activo ? "text-muted-foreground" : "font-medium text-foreground",
                  )}
                >
                  {etiqueta(alumno.vinculo)}
                </span>
                <span className="mt-0.5 block text-[0.7rem] text-muted-foreground/75">
                  alta {distanciaRelativa(hoy, alumno.fechaAltaOriginal)}
                </span>
              </span>

              {/* SITUACIÓN DE PAGO, derivada. */}
              <span className="col-span-2 col-start-2 row-start-3 min-w-0 lg:col-span-1 lg:col-start-4 lg:row-start-1">
                {activo ? (
                  <>
                    <BarraDeCobertura
                      segmentos={alumno.segmentos}
                      posicionDeHoy={posicionDeHoy}
                      estado={alumno.estado}
                      titulo={`${alumno.nombre} ${alumno.apellido}: ${alumno.detalle}`}
                    />
                    <span
                      className={cn(
                        "mt-1.5 block truncate text-xs",
                        TEXTO_DE_ESTADO[alumno.estado],
                      )}
                    >
                      {alumno.detalle}
                    </span>
                  </>
                ) : (
                  <span className="block text-xs text-muted-foreground/70">
                    Sin cobro mientras esté {etiqueta(alumno.vinculo).toLowerCase()}
                  </span>
                )}
              </span>

              <ChevronRight
                className="col-start-3 row-start-1 size-4 shrink-0 text-muted-foreground/40 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground lg:col-start-5"
                strokeWidth={2}
              />
            </Link>
          </motion.li>
        );
      })}
    </ul>
  );
}
