import type { Metadata } from "next";
import { contextoDeImportacionQuery } from "@/use-cases/importacion/consultas";
import { AsistenteDeImportacion } from "@/components/features/importacion/asistente";
import { Aparece } from "@/components/motion/primitivas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Importar" };

/**
 * IMPORTAR — traer una planilla de alumnos.
 *
 * El análisis corre entero en el navegador: el archivo no sale de la
 * máquina del dueño. Lo único que viaja del servidor al cliente es qué
 * planes existen y los nombres del padrón actual, que es lo mínimo para
 * poder detectar duplicados y planes inexistentes de verdad.
 */
export default async function ImportarPage() {
  const contexto = await contextoDeImportacionQuery();

  if (!contexto.ok) {
    return (
      <Alert variant={contexto.kind === "FORBIDDEN" ? "default" : "destructive"}>
        <AlertTitle>
          {contexto.kind === "FORBIDDEN"
            ? "Solo el dueño puede importar alumnos"
            : "No pudimos preparar la importación"}
        </AlertTitle>
        <AlertDescription>
          {contexto.kind === "FORBIDDEN"
            ? "Una importación toca el padrón entero de una vez. Pedísela al dueño."
            : "Volvé a intentar en un momento."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Aparece>
        <div>
          <p className="t-rotulo">
            Sistema
          </p>
          <h1 className="t-titulo mt-1.5 text-[1.5rem] sm:text-[1.625rem]">
            Importar alumnos
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Traé tu planilla y mirá exactamente qué entendió el sistema antes de que se escriba
            nada. Hoy hay{" "}
            <span className="tabular text-foreground">{contexto.data.existentes.length}</span>{" "}
            personas cargadas: cualquier coincidencia con ellas se marca como duplicado.
          </p>
        </div>
      </Aparece>

      <Aparece retraso={0.04}>
        <AsistenteDeImportacion contexto={contexto.data} />
      </Aparece>
    </div>
  );
}
