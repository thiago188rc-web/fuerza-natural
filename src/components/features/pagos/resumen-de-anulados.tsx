"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { AnuladoDelHistorial } from "@/use-cases/pagos/consultas";
import { NumeroAnimado } from "@/components/motion/primitivas";
import { Importe } from "@/components/importe";
import { etiquetaCorta } from "@/domain/fechas/calendario";
import { iniciales } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * El número de "Anulados" de arriba, con el detalle escondido detrás de un
 * toque: quién fue, cuándo pagó, qué día se anuló y por qué. El número
 * solo no alcanza para que alguien confíe en que "ya está resuelto" — hay
 * que poder entrar y ver que el error de tal día era de tal persona.
 */
export function ResumenDeAnulados({
  anulados,
  moneda,
  hoy,
}: {
  anulados: AnuladoDelHistorial[];
  moneda: string;
  hoy: string;
}) {
  const [abierto, setAbierto] = useState(false);

  if (anulados.length === 0) return null;

  const total = anulados.reduce((suma, a) => suma + a.monto, 0);

  return (
    <div className="w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex items-start gap-1.5 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
      >
        <span>
          <span className="t-rotulo block text-descubierto">Anulados</span>
          <span className="t-cifra mt-2 block text-[2rem] text-descubierto">
            <NumeroAnimado valor={anulados.length} />
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            <Importe valor={total} moneda={moneda} /> — ya descontados del total
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            abierto && "rotate-180",
          )}
          strokeWidth={2}
        />
      </button>

      {abierto ? (
        <ul className="mt-3 w-full space-y-1 border-t border-border pt-3 sm:w-80">
          {anulados.map((a) => (
            <li key={a.id}>
              <Link
                href={`/alumnos/${a.studentId}`}
                className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 -mx-1.5 text-sm transition-colors duration-150 hover:bg-muted"
              >
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full font-mono text-[0.6rem] text-muted-foreground ring-1 ring-border">
                  {iniciales(a.nombre, a.apellido)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">
                      {a.apellido}, {a.nombre}
                    </span>
                    <span className="tabular shrink-0 font-mono text-xs text-muted-foreground line-through">
                      <Importe valor={a.monto} moneda={moneda} />
                    </span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Pagó el {etiquetaCorta(a.fechaPago, hoy)} · anulado el{" "}
                    {etiquetaCorta(a.anuladoEn.slice(0, 10), hoy)} por {a.anuladoPorNombre}
                  </span>
                  {a.anuladoMotivo ? (
                    <span className="block text-xs text-muted-foreground/80">
                      {a.anuladoMotivo}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
