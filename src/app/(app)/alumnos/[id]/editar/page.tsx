import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { editarAlumnoFormAction } from "../../actions";
import { FormularioAlumno } from "@/components/features/alumnos/formulario-alumno";
import { listarPlanesQuery, obtenerFichaAlumnoQuery } from "@/use-cases/alumnos/consultas";
import { obtenerHoyDelGimnasioQuery } from "@/use-cases/gimnasio/consultas";
import { nombreCompleto } from "@/domain/alumnos/identidad";

export const metadata = { title: "Editar alumno · Fuerza Natural" };

/**
 * Edición de datos. Actualiza la MISMA fila — el alumno sigue teniendo un
 * solo registro, que es la premisa de todo el módulo.
 *
 * El plan actual del alumno se agrega a la lista aunque esté desactivado:
 * si el dueño desactiva un plan viejo, la ficha de quien lo tenía no puede
 * quedar sin poder guardarse. Si elige otro, ya no vuelve a aparecer.
 */
export default async function EditarAlumnoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [ficha, planes, hoy] = await Promise.all([
    obtenerFichaAlumnoQuery(id),
    listarPlanesQuery(),
    obtenerHoyDelGimnasioQuery(),
  ]);

  if (!ficha.ok) {
    if (ficha.kind === "FORBIDDEN") redirect("/login");
    if (ficha.kind === "NOT_FOUND") notFound();
  }
  if (!ficha.ok || !planes.ok || !hoy.ok) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          No pudimos cargar el formulario. Recargá la página.
        </CardContent>
      </Card>
    );
  }

  const { alumno } = ficha.data;
  const opcionesPlan = planes.data.some((p) => p.id === alumno.planId)
    ? planes.data
    : [
        ...planes.data,
        {
          id: alumno.planId,
          nombre: `${alumno.planNombre} (inactivo)`,
          diasSemana: alumno.planDiasSemana,
        },
      ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Link
          href={`/alumnos/${alumno.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {nombreCompleto(alumno.nombre, alumno.apellido)}
        </Link>
        <h1 className="text-xl font-semibold text-foreground">Editar datos</h1>
        <p className="text-sm text-muted-foreground">
          El estado del alumno se cambia desde la ficha, no desde acá.
        </p>
      </div>

      <Card>
        <CardContent>
          <FormularioAlumno
            accion={editarAlumnoFormAction}
            planes={opcionesPlan}
            hoy={hoy.data}
            textoEnviar="Guardar cambios"
            hrefCancelar={`/alumnos/${alumno.id}`}
            valores={{
              id: alumno.id,
              nombre: alumno.nombre,
              apellido: alumno.apellido,
              telefono: alumno.telefono ?? "",
              planId: alumno.planId,
              fechaAltaOriginal: alumno.fechaAltaOriginal,
              notas: alumno.notas ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
