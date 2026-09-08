"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { EventoDelPanel } from "@/use-cases/panel/consultas";
import { NumeroAnimado } from "@/components/motion/primitivas";
import { Importe } from "@/components/importe";
import { detalleDeEvento, formaDeEvento } from "@/components/features/actividad/eventos";
import { distanciaRelativa, etiquetaCorta } from "@/domain/fechas/calendario";

/**
 * EL CONTEXTO DEL PANEL. Una sola superficie con tres lecturas separadas
 * por hairlines, no tres tarjetas apiladas: son tres respuestas del mismo
 * mes, y ponerlas en cajas distintas las hacía parecer tres widgets sin
 * relación.
 *
 *   · cuánto entró            → lo cobrado en el mes
 *   · cómo se movió el padrón → altas, vueltas, pausas y bajas
 *   · qué pasó recién         → los últimos hechos
 *
 * Ninguna es una "tarjeta de KPI": no hay ícono decorativo, ni flecha de
 * tendencia, ni porcentaje inventado contra un mes anterior que el
 * sistema todavía no tiene con qué comparar.
 */
export function ColumnaDeContexto({
  cobrado,
  moneda,
  movimiento,
  eventos,
  hoy,
  etiquetaMes,
}: {
  cobrado: { total: number; cantidad: number };
  moneda: string;
  movimiento: { nuevos: number; volvieron: number; dejaron: number; pausaron: number };
  eventos: EventoDelPanel[];
  hoy: string;
  etiquetaMes: string;
}) {
  const mes = etiquetaMes.split(" ")[0];

  return (
    <aside className="superficie divide-y divide-border" aria-label="Contexto del mes">
      <Cobrado total={cobrado.total} cantidad={cobrado.cantidad} moneda={moneda} mes={mes} />
      <Movimiento movimiento={movimiento} mes={mes} />
      <ActividadReciente eventos={eventos} hoy={hoy} />
    </aside>
  );
}

function Cobrado({
  total,
  cantidad,
  moneda,
  mes,
}: {
  total: number;
  cantidad: number;
  moneda: string;
  mes: string;
}) {
  return (
    <section className="px-5 py-4">
      <p className="t-rotulo">Cobrado en {mes}</p>
      <p className="t-cifra mt-2.5 text-[1.75rem]">
        <Importe valor={total} moneda={moneda} simboloClassName="text-lg" />
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {cantidad === 0 ? (
          "Todavía no se registraron pagos este mes"
        ) : (
          <>
            <span className="tabular text-foreground">{cantidad}</span>{" "}
            {cantidad === 1 ? "pago registrado" : "pagos registrados"}
          </>
        )}
      </p>
    </section>
  );
}

const LINEAS_DE_MOVIMIENTO = [
  { clave: "nuevos", etiqueta: "Nuevos", signo: "+" },
  { clave: "volvieron", etiqueta: "Volvieron", signo: "+" },
  { clave: "pausaron", etiqueta: "Pausaron", signo: "" },
  { clave: "dejaron", etiqueta: "Dejaron", signo: "−" },
] as const;

function Movimiento({
  movimiento,
  mes,
}: {
  movimiento: { nuevos: number; volvieron: number; dejaron: number; pausaron: number };
  mes: string;
}) {
  return (
    <section className="px-5 py-4">
      <p className="t-rotulo">Movimiento de {mes}</p>
      <dl className="mt-2.5 space-y-1.5">
        {LINEAS_DE_MOVIMIENTO.map((linea) => {
          const valor = movimiento[linea.clave];
          return (
            <div key={linea.clave} className="flex items-baseline justify-between gap-3">
              <dt className="text-[0.8125rem] text-muted-foreground">{linea.etiqueta}</dt>
              <dd className="tabular font-mono text-[0.8125rem]">
                {valor === 0 ? (
                  <span className="text-muted-foreground/50">0</span>
                ) : (
                  <>
                    <span className="text-muted-foreground">{linea.signo}</span>
                    <NumeroAnimado valor={valor} />
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function ActividadReciente({ eventos, hoy }: { eventos: EventoDelPanel[]; hoy: string }) {
  return (
    <section>
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <p className="t-rotulo">Actividad reciente</p>
        <Link
          href="/actividad"
          className="inline-flex items-center gap-0.5 rounded-sm text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
        >
          Ver todo
          <ArrowUpRight className="size-3" strokeWidth={2} />
        </Link>
      </header>

      {eventos.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          Todavía no hay movimientos registrados.
        </p>
      ) : (
        <ol className="px-5 pb-4">
          {eventos.map((evento, i) => {
            const forma = formaDeEvento(evento.tipo);
            const Icono = forma.icono;
            const detalle = detalleDeEvento(evento.tipo, evento.datos);
            const ultimo = i === eventos.length - 1;

            return (
              <li key={evento.id} className="relative flex gap-3 pb-3.5 last:pb-0">
                {/* El hilo vertical del timeline. Se corta en el último
                    para que la línea no quede colgando en el aire. */}
                {!ultimo ? (
                  <span
                    aria-hidden
                    className="absolute top-6 bottom-0 left-[0.6875rem] w-px bg-border"
                  />
                ) : null}

                <span className="relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-card ring-1 ring-border">
                  <Icono className={`size-3 ${forma.tono}`} strokeWidth={2} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[0.8125rem] leading-snug">
                    <Link
                      href={`/alumnos/${evento.studentId}`}
                      className="rounded-sm font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
                    >
                      {evento.nombre} {evento.apellido}
                    </Link>{" "}
                    <span className="text-muted-foreground">{forma.verbo}</span>
                  </span>
                  {detalle ? (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {detalle}
                    </span>
                  ) : null}
                  <span className="tabular mt-0.5 block truncate font-mono text-[0.68rem] text-muted-foreground/75">
                    {distanciaRelativa(hoy, evento.ocurridoEl) === "hoy"
                      ? "hoy"
                      : etiquetaCorta(evento.ocurridoEl, hoy)}{" "}
                    · {evento.actorNombre}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
