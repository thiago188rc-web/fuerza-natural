import { ArrowRight } from "lucide-react";
import { detalleDeEvento, formaDeEvento } from "@/components/features/actividad/eventos";
import { IrAPestana } from "@/components/pestanas";
import { etiquetaCorta } from "@/domain/fechas/calendario";
import { cn } from "@/lib/utils";

interface EventoDeLaFicha {
  id: string;
  tipo: string;
  ocurridoEl: string;
  datos: unknown;
  actorNombre: string;
}

/**
 * El historial del alumno: los hechos de negocio, en orden.
 *
 * Sale de `student_events`, que es el registro CURADO para leerse — no del
 * log de auditoría técnica. Son dos cosas distintas por diseño: uno cuenta
 * la historia de la persona, el otro sirve para investigar qué pasó en el
 * sistema. Mezclarlos llenaría esta columna de ruido.
 */
export function HistorialDelAlumno({
  eventos,
  hoy,
  limite,
}: {
  eventos: EventoDeLaFicha[];
  hoy: string;
  /** En el resumen se muestran solo los últimos; el resto está en su pestaña. */
  limite?: number;
}) {
  const visibles = limite ? eventos.slice(0, limite) : eventos;
  const ocultos = eventos.length - visibles.length;

  return (
    <section className="superficie px-5 py-5">
      <h2 className="t-rotulo">Historial</h2>

      {eventos.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Todavía no hay movimientos.</p>
      ) : (
        <ol className="mt-4">
          {visibles.map((evento, i) => {
            const forma = formaDeEvento(evento.tipo);
            const Icono = forma.icono;
            const detalle = detalleDeEvento(
              evento.tipo,
              (evento.datos ?? {}) as Record<string, unknown>,
            );
            const ultimo = i === visibles.length - 1;

            return (
              <li key={evento.id} className="relative flex gap-3 pb-3.5 last:pb-0">
                {!ultimo ? (
                  <span
                    aria-hidden
                    className="absolute top-6 bottom-0 left-[0.6875rem] w-px bg-border"
                  />
                ) : null}

                <span className="relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-card ring-1 ring-border">
                  <Icono className={cn("size-3", forma.tono)} strokeWidth={2} />
                </span>

                <span className="min-w-0 flex-1">
                  {/* `first-letter` y no `capitalize`: capitalize pone mayúscula en CADA
                      palabra y "Se Dio De Alta" se lee como un error. */}
                  <span className="block text-sm leading-snug first-letter:uppercase">
                    {forma.verbo}
                  </span>
                  {detalle ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{detalle}</span>
                  ) : null}
                  {/* El nombre entero, recortado por CSS si no entra. Quedarse
                      con la primera palabra ahorraba espacio y perdía el dato:
                      "quién lo hizo" es media razón de ser de este historial. */}
                  <span className="tabular mt-0.5 block truncate font-mono text-[0.7rem] text-muted-foreground/80">
                    {etiquetaCorta(evento.ocurridoEl, hoy)} · {evento.actorNombre}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {ocultos > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <IrAPestana clave="historial">
            Ver los {eventos.length} movimientos
            <ArrowRight className="size-3" strokeWidth={2.25} />
          </IrAPestana>
        </div>
      ) : null}
    </section>
  );
}
