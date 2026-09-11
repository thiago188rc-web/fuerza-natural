import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BotonLink } from "@/components/boton-link";
import { FormularioAlumno } from "@/components/features/alumnos/formulario-alumno";
import { crearAlumnoFormAction } from "../actions";
import { listarPlanesQuery } from "@/use-cases/alumnos/consultas";
import { obtenerHoyDelGimnasioQuery } from "@/use-cases/gimnasio/consultas";

export const metadata = { title: "Nuevo alumno · Fuerza Natural" };

/**
 * Alta manual. Los planes salen de `app.plans` (lo que el dueño configuró),
 * nunca de una lista hardcodeada.
 *
 * "1/2 MES" NO aparece acá y no debe aparecer nunca: no es un plan de la
 * persona sino una modalidad de cobertura de un pago puntual
 * (docs/REGLAS-DE-NEGOCIO.md §3). Un alumno de 5 días que paga medio mes
 * sigue siendo de 5 días. Por eso su precio vive en `gym_settings` y no
 * como fila de `plans`: si estuviera en `plans`, este desplegable lo
 * ofrecería como plan habitual.
 */
export default async function NuevoAlumnoPage() {
  const [planes, hoy] = await Promise.all([listarPlanesQuery(), obtenerHoyDelGimnasioQuery()]);

  if (!planes.ok || !hoy.ok) {
    const sinPermiso =
      (!planes.ok && planes.kind === "FORBIDDEN") || (!hoy.ok && hoy.kind === "FORBIDDEN");
    if (sinPermiso) redirect("/login");
    return <NoSePuedeDarDeAlta motivo="No pudimos cargar la configuración del gimnasio." />;
  }

  if (planes.data.length === 0) {
    return (
      <NoSePuedeDarDeAlta motivo="Todavía no hay planes activos configurados. Un alumno siempre tiene un plan, así que primero hay que crear al menos uno." />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="t-titulo text-[1.5rem]">Nuevo alumno</h1>
        <p className="text-sm text-muted-foreground">
          Solo los datos necesarios. El estado inicial es Activo.
        </p>
      </div>

      <Card>
        <CardContent>
          <FormularioAlumno
            accion={crearAlumnoFormAction}
            planes={planes.data}
            hoy={hoy.data}
            textoEnviar="Crear alumno"
            hrefCancelar="/alumnos"
            valores={{
              nombre: "",
              apellido: "",
              telefono: "",
              planId: planes.data[0]?.id ?? "",
              fechaAltaOriginal: hoy.data,
              notas: "",
              genero: "",
              fechaNacimiento: "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function NoSePuedeDarDeAlta({ motivo }: { motivo: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No se puede dar de alta todavía</CardTitle>
        <CardDescription>{motivo}</CardDescription>
      </CardHeader>
      <CardContent>
        <BotonLink href="/alumnos" variant="outline">
          Volver a Alumnos
        </BotonLink>
      </CardContent>
    </Card>
  );
}
