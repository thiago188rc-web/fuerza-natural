import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { alumnosSinGeneroQuery } from "@/use-cases/alumnos/asignar-genero";
import { CompletarGenero } from "@/components/features/alumnos/completar-genero";
import { Aparece } from "@/components/motion/primitivas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Completar género" };

/**
 * COMPLETAR GÉNERO — el dato que la base del gimnasio no trae y que el
 * sistema no adivina por el nombre. Por defecto, solo los que no están de
 * baja: son los que cuentan en Métricas.
 */
export default async function CompletarGeneroPage({
  searchParams,
}: {
  searchParams: Promise<{ bajas?: string }>;
}) {
  const { bajas } = await searchParams;
  const incluirBajas = bajas === "1";
  const resultado = await alumnosSinGeneroQuery({ incluirBajas });
  if (!resultado.ok) {
    if (resultado.kind === "FORBIDDEN") redirect("/login");
    return (
      <Alert variant="destructive">
        <AlertTitle>No pudimos cargar la lista</AlertTitle>
        <AlertDescription>Recargá la página en un momento.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <Aparece>
        <div>
          <Link
            href="/alumnos"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
            Alumnos
          </Link>
          <h1 className="t-titulo mt-1.5 text-[1.5rem] sm:text-[1.625rem]">Completar género</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            La planilla no lo traía. Se completa a mano, de un toque por alumno, o con
            &ldquo;Clasificar automáticamente&rdquo; (adivina por nombre y guarda todo de una — lo
            que no puede adivinar con confianza queda en la lista para completarlo a mano). Con
            esto se completa el gráfico de género de Métricas.
          </p>
          <p className="mt-2 text-xs">
            {incluirBajas ? (
              <Link href="/alumnos/completar-genero" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
                Mostrar solo activos y pausados
              </Link>
            ) : (
              <Link href="/alumnos/completar-genero?bajas=1" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
                Incluir también a los de baja
              </Link>
            )}
          </p>
        </div>
      </Aparece>

      <Aparece retraso={0.04}>
        <CompletarGenero alumnos={resultado.data} />
      </Aparece>
    </div>
  );
}
