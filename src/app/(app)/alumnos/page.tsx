import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { BotonLink } from "@/components/boton-link";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EstadoBadge } from "@/components/features/alumnos/estado-badge";
import { FiltrosAlumnos } from "@/components/features/alumnos/filtros-alumnos";
import { listarAlumnosQuery } from "@/use-cases/alumnos/consultas";
import { ESTADO_FILTRO_TODOS, filtrosAlumnosSchema } from "@/schemas/student";
import { esVinculo, etiquetaVinculo, VINCULOS } from "@/domain/alumnos/vinculo";

export const metadata = { title: "Alumnos · Fuerza Natural" };

type ParametrosBusqueda = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * EL LISTADO — la pantalla donde el dueño va a pasar la mayor parte del
 * tiempo. Todo el estado de la vista (búsqueda, filtro, página) vive en la
 * URL, no en React: es lo que hace que "volver atrás" funcione y que un
 * link a "los pausados" se pueda compartir o guardar.
 *
 * Los datos NUNCA se consultan desde el navegador: esto es un Server
 * Component, la consulta pasa por `withAuth` + RLS, y al cliente solo
 * llegan las filas que este gimnasio puede ver.
 */
export default async function AlumnosPage({
  searchParams,
}: {
  searchParams: ParametrosBusqueda;
}) {
  const params = await searchParams;
  // `.catch()` en el schema: un `?estado=BASURA` en la URL no rompe la
  // pantalla, cae al valor por defecto. Es una URL, la puede editar
  // cualquiera.
  const filtros = filtrosAlumnosSchema.parse({
    q: params.q,
    estado: params.estado,
    pagina: params.pagina,
  });

  const resultado = await listarAlumnosQuery(filtros);
  if (!resultado.ok) {
    if (resultado.kind === "FORBIDDEN") redirect("/login");
    return <ErrorDeCarga />;
  }

  const { filas, total, pagina, porPagina, conteoPorVinculo } = resultado.data;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const hayFiltros = Boolean(filtros.q) || filtros.estado !== ESTADO_FILTRO_TODOS;

  function href(nuevaPagina: number) {
    const p = new URLSearchParams();
    if (filtros.q) p.set("q", filtros.q);
    if (filtros.estado !== ESTADO_FILTRO_TODOS) p.set("estado", filtros.estado);
    if (nuevaPagina > 1) p.set("pagina", String(nuevaPagina));
    const query = p.toString();
    return query ? `/alumnos?${query}` : "/alumnos";
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Alumnos</h1>
          <p className="text-sm text-muted-foreground">
            {VINCULOS.map((v) => `${etiquetaVinculo(v)}s ${conteoPorVinculo[v] ?? 0}`).join(" · ")}
          </p>
        </div>
        <BotonLink href="/alumnos/nuevo">
          <PlusIcon data-icon="inline-start" />
          Nuevo alumno
        </BotonLink>
      </div>

      <FiltrosAlumnos q={filtros.q ?? ""} estado={filtros.estado} />

      {filas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-10 text-sm text-muted-foreground">
            {hayFiltros ? (
              <>
                <p>No encontramos alumnos con esos filtros.</p>
                <BotonLink href="/alumnos" variant="outline" size="sm">
                  Limpiar filtros
                </BotonLink>
              </>
            ) : (
              <>
                <p>No hay alumnos registrados todavía.</p>
                <BotonLink href="/alumnos/nuevo" size="sm">
                  Registrar el primero
                </BotonLink>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Alumno</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Alta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((alumno) => (
                    <TableRow key={alumno.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/alumnos/${alumno.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {alumno.apellido}, {alumno.nombre}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {esVinculo(alumno.vinculo) ? (
                          <EstadoBadge vinculo={alumno.vinculo} />
                        ) : (
                          alumno.vinculo
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{alumno.planNombre}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {alumno.telefono ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {alumno.fechaAltaOriginal}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {total} {total === 1 ? "alumno" : "alumnos"}
              {totalPaginas > 1 ? ` · página ${pagina} de ${totalPaginas}` : ""}
            </span>
            {totalPaginas > 1 ? (
              <div className="flex gap-2">
                <BotonLink
                  href={href(pagina - 1)}
                  variant="outline"
                  size="sm"
                  deshabilitado={pagina <= 1}
                >
                  Anterior
                </BotonLink>
                <BotonLink
                  href={href(pagina + 1)}
                  variant="outline"
                  size="sm"
                  deshabilitado={pagina >= totalPaginas}
                >
                  Siguiente
                </BotonLink>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function ErrorDeCarga() {
  return (
    <Card>
      <CardContent className="py-10 text-sm text-muted-foreground">
        No pudimos cargar los alumnos. Recargá la página; si sigue fallando, avisá.
      </CardContent>
    </Card>
  );
}
