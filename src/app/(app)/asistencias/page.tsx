import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { asistenciaDeHoyQuery } from "@/use-cases/asistencias/consultas";
import { ListaDeAsistencia } from "@/components/features/asistencias/lista-de-asistencia";
import { Aparece, NumeroAnimado } from "@/components/motion/primitivas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fechaLarga } from "@/lib/formato";

export const metadata: Metadata = { title: "Asistencias" };

/**
 * EL CHECK-IN DEL DÍA. Una lista de los alumnos activos con un botón para
 * marcar presente — nada más. No calcula "asistencia esperada" ni compara
 * contra el plan: eso no fue confirmado como regla de negocio, así que no
 * se inventa acá. Solo el hecho, para poder derivar métricas más adelante.
 */
export default async function AsistenciasPage() {
  const resultado = await asistenciaDeHoyQuery();

  if (!resultado.ok) {
    return (
      <Alert variant="destructive">
        <AlertTitle>No pudimos cargar la asistencia</AlertTitle>
        <AlertDescription>
          {resultado.kind === "FORBIDDEN"
            ? "Tu sesión no tiene permiso para ver esta información."
            : "Hubo un problema al leer los datos del gimnasio. Volvé a intentar en un momento."}
        </AlertDescription>
      </Alert>
    );
  }

  const datos = resultado.data;

  return (
    <div className="space-y-5">
      <Aparece>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="t-rotulo first-letter:uppercase">{fechaLarga(datos.hoy)}</p>
            <h1 className="t-titulo mt-1.5 text-[1.5rem] sm:text-[1.625rem]">Asistencias</h1>
          </div>
        </header>
      </Aparece>

      <Aparece retraso={0.04}>
        <dl className="flex flex-wrap items-end gap-x-10 gap-y-4 border-b border-border pb-5">
          <div>
            <dt className="t-rotulo">Presentes hoy</dt>
            <dd className="t-cifra mt-2 text-[2rem]">
              <NumeroAnimado valor={datos.presentes} />
              <span className="ml-1 text-lg text-muted-foreground">/ {datos.total}</span>
            </dd>
          </div>
        </dl>
      </Aparece>

      <Aparece retraso={0.08}>
        {datos.alumnos.length === 0 ? (
          <section className="superficie flex flex-col items-center px-6 py-16 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
              <CalendarCheck className="size-5" strokeWidth={1.75} />
            </span>
            <h2 className="mt-4 t-seccion">No hay alumnos activos</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Cuando haya alumnos activos, van a aparecer acá para marcar su asistencia.
            </p>
          </section>
        ) : (
          <section className="superficie overflow-hidden">
            <ListaDeAsistencia alumnos={datos.alumnos} />
          </section>
        )}
      </Aparece>
    </div>
  );
}
