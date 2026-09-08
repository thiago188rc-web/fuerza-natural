import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { carteraDeCobroQuery, contextoDeCobroQuery } from "@/use-cases/pagos/consultas";
import { BuscadorDeAlumno } from "@/components/features/pagos/buscador-de-alumno";
import { FormularioDeCobro } from "@/components/features/pagos/formulario-de-cobro";
import { Aparece } from "@/components/motion/primitivas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BotonLink } from "@/components/boton-link";

export const metadata: Metadata = { title: "Registrar pago" };

/**
 * El flujo de cobro vive en UNA ruta con dos estados, no en dos pantallas
 * con un asistente: sin alumno en la URL, se busca; con alumno, se cobra.
 *
 * Eso hace que el alumno seleccionado quede en la dirección — se puede
 * volver atrás, recargar, o llegar directo desde la bandeja del panel con
 * el alumno ya elegido, que es como se va a usar la mayoría de las veces.
 */
export default async function NuevoPagoPage({
  searchParams,
}: {
  searchParams: Promise<{ alumno?: string }>;
}) {
  const { alumno: alumnoId } = await searchParams;

  if (!alumnoId) {
    const cartera = await carteraDeCobroQuery();

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Aparece>
          <Encabezado
            titulo="Registrar pago"
            bajada="Elegí a quién le estás cobrando. Empezá a escribir para filtrar."
          />
        </Aparece>

        {!cartera.ok ? (
          <ErrorDeCarga />
        ) : cartera.data.alumnos.length === 0 ? (
          <Aparece retraso={0.04}>
            <section className="superficie px-6 py-14 text-center">
              <h2 className="t-seccion">Todavía no hay alumnos activos</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Para registrar un pago primero tiene que haber alguien a quien cobrarle.
              </p>
              <BotonLink href="/alumnos/nuevo" className="mt-5">
                Dar de alta al primer alumno
              </BotonLink>
            </section>
          </Aparece>
        ) : (
          <Aparece retraso={0.04}>
            <BuscadorDeAlumno alumnos={cartera.data.alumnos} />
          </Aparece>
        )}
      </div>
    );
  }

  const contexto = await contextoDeCobroQuery(alumnoId);

  if (!contexto.ok) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Encabezado titulo="Registrar pago" bajada="" />
        {contexto.kind === "NOT_FOUND" ? (
          <Alert>
            <AlertTitle>No encontramos a ese alumno</AlertTitle>
            <AlertDescription>
              Puede que lo hayan dado de baja o que el enlace esté mal.{" "}
              <Link href="/pagos/nuevo" className="underline underline-offset-4">
                Volver a buscar
              </Link>
            </AlertDescription>
          </Alert>
        ) : (
          <ErrorDeCarga />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Aparece>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href="/pagos/nuevo"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
            >
              <ArrowLeft className="size-3" strokeWidth={2} />
              Elegir otro alumno
            </Link>
            <h1 className="mt-2 font-heading text-2xl leading-none font-semibold">
              Cobrarle a {contexto.data.alumno.nombre}
            </h1>
          </div>
        </div>
      </Aparece>

      <Aparece retraso={0.04}>
        <FormularioDeCobro
          contexto={contexto.data}
          // Generada en el servidor para que el primer render y la
          // hidratación coincidan. Vale para toda la vida de la pantalla:
          // es lo que hace que un doble clic no registre dos pagos.
          claveIdempotencia={crypto.randomUUID()}
        />
      </Aparece>
    </div>
  );
}

function Encabezado({ titulo, bajada }: { titulo: string; bajada: string }) {
  return (
    <div>
      <h1 className="font-heading text-2xl leading-none font-semibold">{titulo}</h1>
      {bajada ? <p className="mt-2 text-sm text-muted-foreground">{bajada}</p> : null}
    </div>
  );
}

function ErrorDeCarga() {
  return (
    <Alert variant="destructive">
      <AlertTitle>No pudimos cargar los datos</AlertTitle>
      <AlertDescription>
        Hubo un problema al leer la información del gimnasio. Volvé a intentar en un momento.
      </AlertDescription>
    </Alert>
  );
}
