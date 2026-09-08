import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveRestore, ChevronRight } from "lucide-react";
import { bajasQuery } from "@/use-cases/alumnos/bajas";
import { Aparece } from "@/components/motion/primitivas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { distanciaRelativa } from "@/domain/fechas/calendario";
import { fechaCompleta, iniciales } from "@/lib/formato";

export const metadata: Metadata = { title: "Bajas" };

/**
 * LAS BAJAS — quiénes se fueron, cuándo y por qué.
 *
 * La pantalla arranca diciendo lo más importante del modelo: dar de baja
 * no borra a nadie. Todo alumno de esta lista conserva su ficha, su
 * historial de pagos y su fecha de alta original, y vuelve a estar activo
 * con un clic si aparece por la puerta.
 *
 * Los motivos se muestran contados, sin gráfico: son cinco o seis
 * categorías y una lista con números se lee más rápido que cualquier
 * torta. El único dato que sí se destaca es cuántas bajas quedaron sin
 * motivo, porque es el que se puede completar.
 */
export default async function BajasPage() {
  const resultado = await bajasQuery();

  if (!resultado.ok) {
    return (
      <Alert variant="destructive">
        <AlertTitle>No pudimos cargar las bajas</AlertTitle>
        <AlertDescription>Volvé a intentar en un momento.</AlertDescription>
      </Alert>
    );
  }

  const { filas, motivos, sinMotivo, recientes, hoy } = resultado.data;

  return (
    <div className="space-y-6">
      <Aparece>
        <div>
          <p className="t-rotulo">
            Registro
          </p>
          <h1 className="t-titulo mt-1.5 text-[1.5rem] sm:text-[1.625rem]">
            Bajas
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Nadie se borra del sistema. Cada persona de esta lista conserva su ficha, su historial
            de pagos y su fecha de alta original — si vuelve, se reactiva desde su ficha y sigue
            siendo la misma persona.
          </p>
        </div>
      </Aparece>

      {filas.length === 0 ? (
        <Aparece retraso={0.04}>
          <section className="superficie flex flex-col items-center px-6 py-16 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-cubierto-suave text-cubierto">
              <ArchiveRestore className="size-5" strokeWidth={1.75} />
            </span>
            <h2 className="mt-4 t-seccion">No hay bajas registradas</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Nadie se dio de baja todavía. Cuando pase, vas a poder ver acá quién se fue, cuándo y
              por qué.
            </p>
          </section>
        </Aparece>
      ) : (
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] lg:items-start">
          <Aparece retraso={0.04} className="min-w-0">
            <section className="superficie overflow-hidden">
              <header className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-4">
                <h2 className="t-seccion">Quiénes se fueron</h2>
                <span className="tabular font-mono text-xs text-muted-foreground">
                  {filas.length}
                </span>
              </header>

              <ul className="divide-y divide-border">
                {filas.map((baja) => (
                  <li key={baja.id} className="fila group">
                    <Link
                      href={`/alumnos/${baja.id}`}
                      className="flex items-center gap-3 px-5 py-3 outline-none"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full font-mono text-[0.7rem] text-muted-foreground ring-1 ring-border">
                        {iniciales(baja.nombre, baja.apellido)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {baja.apellido}, {baja.nombre}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {baja.bajaMotivoEtiqueta ?? "Sin motivo registrado"}
                          {baja.bajaObservacion ? ` · ${baja.bajaObservacion}` : ""}
                        </span>
                      </span>

                      <span className="hidden shrink-0 text-right sm:block">
                        <span className="tabular block font-mono text-xs text-muted-foreground">
                          {baja.bajaFecha ? fechaCompleta(baja.bajaFecha) : "—"}
                        </span>
                        <span className="block text-[0.7rem] text-muted-foreground/70">
                          {baja.bajaFecha ? distanciaRelativa(hoy, baja.bajaFecha) : ""}
                        </span>
                      </span>

                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground/40 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                        strokeWidth={2}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </Aparece>

          <Aparece retraso={0.08} className="min-w-0 space-y-5">
            <section className="superficie px-5 py-4">
              <p className="t-rotulo">
                Últimos 6 meses
              </p>
              <p className="t-cifra mt-2.5 text-[1.75rem]">{recientes}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {recientes === 1 ? "baja registrada" : "bajas registradas"} · {filas.length} en
                total desde que existe el registro
              </p>
            </section>

            <section className="superficie px-5 py-4">
              <p className="t-rotulo">
                Por qué se fueron
              </p>

              {motivos.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Ninguna baja tiene motivo registrado todavía.
                </p>
              ) : (
                <dl className="mt-3 space-y-2">
                  {motivos.map((motivo) => (
                    <div key={motivo.codigo} className="flex items-baseline justify-between gap-3">
                      <dt className="min-w-0 truncate text-sm text-muted-foreground">
                        {motivo.etiqueta}
                      </dt>
                      <dd className="tabular font-mono text-sm">{motivo.total}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {sinMotivo > 0 ? (
                <p className="mt-4 border-t border-border pt-3 text-xs text-revisar">
                  <span className="tabular font-medium">{sinMotivo}</span>{" "}
                  {sinMotivo === 1 ? "baja quedó" : "bajas quedaron"} sin motivo. Se puede
                  completar entrando a la ficha de cada una.
                </p>
              ) : null}
            </section>
          </Aparece>
        </div>
      )}
    </div>
  );
}
