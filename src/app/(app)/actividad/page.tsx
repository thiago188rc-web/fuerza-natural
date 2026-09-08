import type { Metadata } from "next";
import Link from "next/link";
import { History, ShieldCheck } from "lucide-react";
import { actividadQuery, type RegistroDeActividad } from "@/use-cases/actividad/consultas";
import { Aparece } from "@/components/motion/primitivas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BotonLink } from "@/components/boton-link";
import { fechaLarga } from "@/lib/formato";
import { distanciaRelativa } from "@/domain/fechas/calendario";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Actividad" };

/**
 * EL REGISTRO DE ACTIVIDAD — qué pasó, cuándo, sobre quién y quién lo hizo.
 *
 * Agrupado por jornada, porque así es como se lo consulta: "¿qué se tocó
 * ayer?". Dentro de cada día, lo más reciente arriba.
 *
 * Este log es append-only por diseño y está protegido en cuatro capas
 * independientes; la pantalla lo dice explícitamente. No es un detalle de
 * marketing: si el dueño no confía en que el registro no se puede editar,
 * el registro no sirve para nada.
 */

/** Cómo se pinta cada familia de acción. Solo tres tonos: leer, cambiar, quitar. */
function tonoDeAccion(accion: string): string {
  if (accion.endsWith(".created")) return "bg-cubierto";
  if (accion.includes("status_changed") || accion.includes("deactivated")) return "bg-revisar";
  if (accion.includes("deleted") || accion.includes("voided")) return "bg-descubierto";
  return "bg-muted-foreground/45";
}

export default async function ActividadPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const resultado = await actividadQuery(cursor);

  if (!resultado.ok) {
    return (
      <Alert variant={resultado.kind === "FORBIDDEN" ? "default" : "destructive"}>
        <AlertTitle>
          {resultado.kind === "FORBIDDEN"
            ? "Solo el dueño puede ver el registro de actividad"
            : "No pudimos cargar la actividad"}
        </AlertTitle>
        <AlertDescription>
          {resultado.kind === "FORBIDDEN"
            ? "El registro muestra quién hizo cada cambio, incluido el personal del gimnasio. Pedile acceso al dueño si lo necesitás."
            : "Volvé a intentar en un momento."}
        </AlertDescription>
      </Alert>
    );
  }

  const { registros, hoy, total, proximoCursor } = resultado.data;

  // Agrupado por jornada en el servidor: la pantalla solo dibuja.
  const porDia = new Map<string, RegistroDeActividad[]>();
  for (const registro of registros) {
    const lista = porDia.get(registro.dia);
    if (lista) lista.push(registro);
    else porDia.set(registro.dia, [registro]);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Aparece>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="t-rotulo">
              Registro
            </p>
            <h1 className="t-titulo mt-1.5 text-[1.5rem] sm:text-[1.625rem]">
              Actividad
            </h1>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-cubierto" strokeWidth={2} />
            Solo se agrega: nada de esto se puede editar ni borrar
          </p>
        </div>
      </Aparece>

      {registros.length === 0 ? (
        <Aparece retraso={0.04}>
          <section className="superficie flex flex-col items-center px-6 py-16 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
              <History className="size-5" strokeWidth={1.75} />
            </span>
            <h2 className="mt-4 t-seccion">Todavía no hay actividad</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Cada alta, cambio de estado y pago va a quedar registrado acá, con la fecha y quién
              lo hizo.
            </p>
          </section>
        </Aparece>
      ) : (
        <Aparece retraso={0.04} className="space-y-5">
          {[...porDia.entries()].map(([dia, delDia]) => (
            <section key={dia} className="superficie overflow-hidden">
              <header className="flex items-baseline justify-between gap-3 hundido border-b border-border px-5 py-2.5">
                <h2 className="text-[0.8125rem] font-medium capitalize">
                  {dia === hoy ? "Hoy" : fechaLarga(dia)}
                </h2>
                <span className="tabular font-mono text-[0.7rem] text-muted-foreground">
                  {dia === hoy ? fechaLarga(dia) : distanciaRelativa(hoy, dia)}
                </span>
              </header>

              <ol className="divide-y divide-border">
                {delDia.map((registro) => (
                  <li
                    key={registro.id}
                    className="fila flex items-baseline gap-3 px-5 py-2.5"
                  >
                    <span className="tabular w-11 shrink-0 font-mono text-xs text-muted-foreground">
                      {registro.hora}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-[1px]",
                        tonoDeAccion(registro.accion),
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-snug">
                        {registro.entidad === "student" && registro.entidadId ? (
                          <Link
                            href={`/alumnos/${registro.entidadId}`}
                            className="underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
                          >
                            {registro.resumen}
                          </Link>
                        ) : (
                          registro.resumen
                        )}
                      </span>
                      <span className="mt-0.5 block font-mono text-[0.7rem] text-muted-foreground/80">
                        {registro.actorNombre} · {registro.actorRol.toLowerCase()} ·{" "}
                        {registro.accion}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              <span className="tabular">{total}</span> registros en total
            </span>
            <div className="flex gap-2">
              {cursor ? (
                <BotonLink href="/actividad" variant="outline" size="sm">
                  Volver al principio
                </BotonLink>
              ) : null}
              <BotonLink
                href={proximoCursor ? `/actividad?cursor=${encodeURIComponent(proximoCursor)}` : "#"}
                variant="outline"
                size="sm"
                deshabilitado={!proximoCursor}
              >
                Ver más antiguos
              </BotonLink>
            </div>
          </div>
        </Aparece>
      )}
    </div>
  );
}
