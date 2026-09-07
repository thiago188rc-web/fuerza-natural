import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { BotonLink } from "@/components/boton-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EstadoBadge } from "@/components/features/alumnos/estado-badge";
import { CambiarEstado } from "@/components/features/alumnos/cambiar-estado";
import { obtenerFichaAlumnoQuery } from "@/use-cases/alumnos/consultas";
import { obtenerHoyDelGimnasioQuery } from "@/use-cases/gimnasio/consultas";
import { esVinculo } from "@/domain/alumnos/vinculo";
import { nombreCompleto } from "@/domain/alumnos/identidad";

export const metadata = { title: "Ficha de alumno · Fuerza Natural" };

const ETIQUETA_EVENTO: Record<string, string> = {
  ALTA: "Alta",
  BAJA: "Baja",
  REACTIVACION: "Reactivación",
  PAUSA: "Pausa",
  REANUDACION: "Reanudación",
  CAMBIO_PLAN: "Cambio de plan",
  CONTACTO: "Contacto",
  NOTA: "Nota",
};

/**
 * LA FICHA — el centro de contexto del alumno. Hoy muestra sus datos, su
 * estado y su historial; en Fase 2 el bloque de pagos se suma acá, y en
 * Fase 3 el de bajas. Por eso está armada en secciones y no como una lista
 * plana de campos.
 *
 * No inventa nada de pagos: no hay "último pago", ni "vencimiento", ni
 * "moroso". Esos datos todavía no existen en el sistema, y mostrar un
 * placeholder que parezca un dato es peor que no mostrar nada.
 */
export default async function FichaAlumnoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const [ficha, hoy] = await Promise.all([
    obtenerFichaAlumnoQuery(id),
    obtenerHoyDelGimnasioQuery(),
  ]);

  if (!ficha.ok) {
    if (ficha.kind === "FORBIDDEN") redirect("/login");
    if (ficha.kind === "NOT_FOUND") notFound();
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          No pudimos cargar la ficha. Recargá la página.
        </CardContent>
      </Card>
    );
  }

  const { alumno, eventos } = ficha.data;
  const vinculo = esVinculo(alumno.vinculo) ? alumno.vinculo : null;
  const aviso = query.alta ? "Alumno creado." : query.guardado ? "Cambios guardados." : null;

  return (
    <div className="flex flex-col gap-5">
      {aviso ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-600/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
        >
          {aviso}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Link href="/alumnos" className="text-sm text-muted-foreground hover:text-foreground">
            ← Alumnos
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold text-foreground">
              {nombreCompleto(alumno.nombre, alumno.apellido)}
            </h1>
            {vinculo ? <EstadoBadge vinculo={vinculo} /> : null}
          </div>
        </div>
        <BotonLink href={`/alumnos/${alumno.id}/editar`} variant="outline">
          <PencilIcon data-icon="inline-start" />
          Editar
        </BotonLink>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Datos</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Dato etiqueta="Teléfono" valor={alumno.telefono} />
              {/* Solo el nombre del plan: es la referencia estable que va a usar
                  Fase 2. Los días por semana son un atributo del plan y se
                  configuran en Configuración — repetirlos acá daba
                  "2 días (2 días/semana)". */}
              <Dato etiqueta="Plan" valor={alumno.planNombre} />
              <Dato etiqueta="Fecha de alta" valor={alumno.fechaAltaOriginal} />
              <Dato etiqueta="Estado desde" valor={alumno.vinculoDesde} />
              {alumno.pausaHasta ? <Dato etiqueta="Pausado hasta" valor={alumno.pausaHasta} /> : null}
              {alumno.pausaNota ? <Dato etiqueta="Motivo de la pausa" valor={alumno.pausaNota} /> : null}
              {alumno.bajaFecha ? <Dato etiqueta="Fecha de baja" valor={alumno.bajaFecha} /> : null}
              {alumno.bajaMotivoEtiqueta ? (
                <Dato etiqueta="Motivo de la baja" valor={alumno.bajaMotivoEtiqueta} />
              ) : null}
              {alumno.bajaObservacion ? (
                <Dato etiqueta="Observación de la baja" valor={alumno.bajaObservacion} />
              ) : null}
              <div className="sm:col-span-2">
                <Dato etiqueta="Observaciones" valor={alumno.notas} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Pagos</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              El registro de pagos y la situación de pago se implementan en Fase 2. Todavía no hay
              ningún dato de pagos en el sistema, así que acá no se muestra ninguno.
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Estado</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vinculo && hoy.ok ? (
                <CambiarEstado alumnoId={alumno.id} vinculoActual={vinculo} hoy={hoy.data} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No se puede cambiar el estado en este momento.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Historial</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {eventos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>
              ) : (
                <ol className="flex flex-col gap-3 text-sm">
                  {eventos.map((evento, i) => (
                    <li key={evento.id} className="flex flex-col gap-1">
                      {i > 0 ? <Separator className="mb-2" /> : null}
                      <span className="font-medium text-foreground">
                        {ETIQUETA_EVENTO[evento.tipo] ?? evento.tipo}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {evento.ocurridoEl} · {evento.actorNombre}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <span className="text-sm text-foreground">{valor?.trim() ? valor : "—"}</span>
    </div>
  );
}
