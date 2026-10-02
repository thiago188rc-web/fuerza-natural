"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { asignarGeneroAccion } from "@/app/(app)/alumnos/actions";
import { Button } from "@/components/ui/button";
import { GENEROS, etiquetaGenero, type Genero } from "@/domain/alumnos/genero";
import type { AlumnoSinGenero } from "@/use-cases/alumnos/asignar-genero";
import { cn } from "@/lib/utils";

/**
 * La lista de "completar género": un toque por alumno y pasa al siguiente.
 * El que se resolvió se va de la lista al instante; si el servidor rechaza
 * el cambio, vuelve con el motivo al lado.
 */
export function CompletarGenero({ alumnos }: { alumnos: AlumnoSinGenero[] }) {
  const [resueltos, setResueltos] = useState<Record<string, Genero>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const pendientes = alumnos.filter((a) => !resueltos[a.id]);
  const hechos = alumnos.length - pendientes.length;

  function asignar(alumno: AlumnoSinGenero, genero: Genero) {
    setEnCurso(alumno.id);
    setResueltos((r) => ({ ...r, [alumno.id]: genero }));
    iniciar(async () => {
      const resultado = await asignarGeneroAccion(alumno.id, genero);
      if (!resultado.ok) {
        setResueltos((r) => {
          const copia = { ...r };
          delete copia[alumno.id];
          return copia;
        });
        setErrores((e) => ({ ...e, [alumno.id]: resultado.mensaje ?? "No se pudo guardar." }));
      } else {
        setErrores((e) => {
          const copia = { ...e };
          delete copia[alumno.id];
          return copia;
        });
      }
      setEnCurso(null);
    });
  }

  if (alumnos.length === 0) {
    return (
      <section className="superficie px-6 py-14 text-center">
        <h2 className="t-seccion">Todos tienen el género cargado</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          El gráfico de género de Métricas ya cuenta a todo el padrón.
        </p>
      </section>
    );
  }

  return (
    <section className="superficie overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <p className="text-sm">
          <span className="t-cifra">{pendientes.length}</span>{" "}
          <span className="text-muted-foreground">por completar</span>
          {hechos > 0 ? <span className="text-muted-foreground"> · {hechos} listos</span> : null}
        </p>
        <div
          className="h-1.5 w-40 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={alumnos.length}
          aria-valuenow={hechos}
          aria-label="Avance"
        >
          <div
            className="h-full rounded-full bg-verde transition-[width] duration-300"
            style={{ width: `${(hechos / alumnos.length) * 100}%` }}
          />
        </div>
      </header>

      {pendientes.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          Listo: completaste los {alumnos.length}.{" "}
          <Link href="/metricas" className="font-medium text-foreground underline underline-offset-4">
            Ver Métricas
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {pendientes.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2.5">
              <div className="min-w-0">
                <Link href={`/alumnos/${a.id}`} className="truncate text-sm font-medium hover:underline">
                  {a.apellido}, {a.nombre}
                </Link>
                {a.vinculo !== "ACTIVO" ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {a.vinculo === "BAJA" ? "De baja" : "Pausado"}
                  </span>
                ) : null}
                {errores[a.id] ? (
                  <p role="alert" className="text-xs text-destructive">
                    {errores[a.id]}
                  </p>
                ) : null}
              </div>
              {/* En el celular, botones grandes y a todo el ancho: esto se
                  hace de a cientos de toques seguidos. */}
              <div className="flex w-full gap-2 sm:w-auto">
                {GENEROS.map((g) => (
                  <Button
                    key={g}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={enCurso === a.id}
                    onClick={() => asignar(a, g)}
                    className={cn("h-10 flex-1 sm:h-8 sm:min-w-[6.5rem] sm:flex-none")}
                  >
                    {etiquetaGenero(g)}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
