"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Search, UserPlus } from "lucide-react";
import type { AlumnoParaCobrar } from "@/use-cases/pagos/consultas";
import { Senal, TEXTO_DE_ESTADO } from "@/components/features/cobertura/senal";
import { normalizarTerminoBusqueda } from "@/domain/alumnos/busqueda";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * PASO 1 DEL COBRO: encontrar a la persona.
 *
 * La lista entera de activos ya viaja con la página, así que filtrar es
 * instantáneo — sin ida y vuelta al servidor, sin "buscando…", sin
 * debounce. Para un padrón de cientos de alumnos eso es unos pocos KB, y
 * el resultado es que escribir tres letras y apretar Enter registra un
 * pago en segundos. Ese es el objetivo del flujo entero.
 *
 * El orden por defecto NO es alfabético: primero los que están sin cubrir.
 * Quien viene a cobrar suele venir a cobrarle justamente a esos, y una
 * lista alfabética obligaría a buscar a alguien que el sistema ya sabe que
 * hay que buscar.
 */

/** Cuántas filas se dibujan de una. El resto se alcanza escribiendo. */
const TOPE_VISIBLE = 30;

const GRAVEDAD: Record<string, number> = {
  DESCUBIERTO: 0,
  REVISAR: 1,
  CUBIERTO: 2,
  NO_APLICA: 3,
};

export function BuscadorDeAlumno({ alumnos }: { alumnos: AlumnoParaCobrar[] }) {
  const quieto = useReducedMotion();
  const [termino, setTermino] = useState("");

  const indexados = useMemo(
    () =>
      alumnos
        .map((a) => ({
          ...a,
          // El mismo normalizado que usa la base: sin acentos, en
          // minúsculas. Así "gomez" encuentra a "Gómez".
          clave: normalizarTerminoBusqueda(`${a.nombre} ${a.apellido}`),
        }))
        .sort((a, b) => {
          const porEstado = (GRAVEDAD[a.estado] ?? 9) - (GRAVEDAD[b.estado] ?? 9);
          if (porEstado !== 0) return porEstado;
          return a.apellido.localeCompare(b.apellido, "es");
        }),
    [alumnos],
  );

  const filtrados = useMemo(() => {
    const palabras = normalizarTerminoBusqueda(termino).split(" ").filter(Boolean);
    if (palabras.length === 0) return indexados;
    return indexados.filter((a) => palabras.every((p) => a.clave.includes(p)));
  }, [indexados, termino]);

  // Se filtra sobre el padrón entero pero se DIBUJAN unos pocos. Con 61
  // alumnos la lista completa ya arma una página de casi 8.000px; con 300
  // sería una tira interminable que nadie va a recorrer con el ojo pudiendo
  // escribir tres letras. El orden ya puso adelante a los que hay que
  // cobrar, así que el recorte no esconde nada urgente.
  const visibles = filtrados.slice(0, TOPE_VISIBLE);
  const ocultos = filtrados.length - visibles.length;

  return (
    <div className="superficie">
      {/* El buscador queda pegado arriba mientras la lista se desplaza
          con la página: así se puede seguir tipeando sin volver al tope,
          y ninguna fila queda cortada por la mitad como pasaba con un
          contenedor de alto fijo. */}
      <div className="sticky top-0 z-10 rounded-t-xl border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2}
          />
          <Input
            autoFocus
            value={termino}
            onChange={(e) => setTermino(e.target.value)}
            placeholder="Buscar por nombre o apellido…"
            aria-label="Buscar alumno"
            className="h-14 rounded-none border-0 bg-transparent pl-11 text-base shadow-none focus-visible:ring-0"
          />
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-sm font-medium">Sin resultados para “{termino}”</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Puede que esté dado de baja o que todavía no esté cargado.
          </p>
          <Link
            href="/alumnos/nuevo"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-verde underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
          >
            <UserPlus className="size-3.5" strokeWidth={2} />
            Dar de alta a alguien nuevo
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {visibles.map((alumno, i) => (
            <motion.li
              key={alumno.id}
              initial={quieto || i > 12 ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: DURACION.rapido,
                ease: SALIDA,
                delay: quieto ? 0 : Math.min(i, 12) * 0.016,
              }}
            >
              <Link
                href={`/pagos/nuevo?alumno=${alumno.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <Senal estado={alumno.estado} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {alumno.nombre} {alumno.apellido}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {alumno.planNombre}
                  </span>
                </span>
                <span
                  className={cn(
                    "hidden max-w-[19rem] truncate text-right text-xs sm:block",
                    TEXTO_DE_ESTADO[alumno.estado],
                  )}
                >
                  {alumno.detalle}
                </span>
              </Link>
            </motion.li>
          ))}
        </ul>
      )}

      <p className="rounded-b-xl hundido border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
        {ocultos > 0 ? (
          <>
            Mostrando <span className="tabular">{visibles.length}</span> de{" "}
            <span className="tabular">{filtrados.length}</span>
            {termino === "" ? " alumnos activos" : " coincidencias"} · escribí para encontrar a
            alguien puntual
          </>
        ) : (
          <>
            <span className="tabular">{filtrados.length}</span> de{" "}
            <span className="tabular">{alumnos.length}</span> alumnos activos · los que están sin
            cubrir aparecen primero
          </>
        )}
      </p>
    </div>
  );
}
