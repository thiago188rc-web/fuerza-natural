import type { Metadata } from "next";
import { Info } from "lucide-react";
import { contextoDelGimnasio } from "@/use-cases/gimnasio/contexto";
import { getAuthContext } from "@/lib/auth/context";
import { FormularioDePrecios } from "@/components/features/configuracion/formulario-de-precios";
import { VentanaDeCobro } from "@/components/features/configuracion/ventana-de-cobro";
import { Aparece } from "@/components/motion/primitivas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Configuración" };

/**
 * CONFIGURACIÓN — lo que el gimnasio decide, guardado como DATO.
 *
 * Todo lo que se ve acá está en la base, no en el código: los planes, los
 * precios, los umbrales con los que se deriva la situación de pago y el
 * catálogo de motivos de baja. Es lo que hace que un cambio de precio sea
 * una tarea de treinta segundos y no un despliegue.
 *
 * Solo el dueño puede guardar. El personal puede mirar: saber cuánto sale
 * cada plan es parte de cobrar bien.
 */
export default async function ConfiguracionPage() {
  const [ctx, contexto] = await Promise.all([getAuthContext(), contextoDelGimnasio()]);

  if (!contexto.ok) {
    return (
      <Alert variant="destructive">
        <AlertTitle>No pudimos cargar la configuración</AlertTitle>
        <AlertDescription>Volvé a intentar en un momento.</AlertDescription>
      </Alert>
    );
  }

  const datos = contexto.data;
  const esDueno = ctx?.rol === "DUENO";
  const sinPrecio = datos.planes.filter((p) => p.precio === null);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Aparece>
        <div>
          <p className="t-rotulo">
            Sistema
          </p>
          <h1 className="t-titulo mt-1.5 text-[1.5rem] sm:text-[1.625rem]">
            Configuración
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {datos.nombre} · {datos.timezone.replace(/_/g, " ")} · {datos.moneda}
          </p>
        </div>
      </Aparece>

      {sinPrecio.length > 0 ? (
        <Aparece retraso={0.02}>
          <p className="flex items-start gap-2 rounded-lg border border-revisar/25 bg-revisar-suave px-3.5 py-2.5 text-sm text-revisar">
            <Info className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
            <span>
              {sinPrecio.length === 1 ? "El plan " : "Los planes "}
              <strong className="font-medium">
                {sinPrecio.map((p) => p.nombre).join(", ")}
              </strong>{" "}
              {sinPrecio.length === 1 ? "no tiene" : "no tienen"} precio confirmado. Al cobrar hay
              que escribir el importe a mano — el sistema no inventa un número.
            </span>
          </p>
        </Aparece>
      ) : null}

      {!esDueno ? (
        <Aparece retraso={0.02}>
          <Alert>
            <AlertTitle>Estás viendo la configuración en modo lectura</AlertTitle>
            <AlertDescription>
              Los precios y los parámetros de cobro los cambia el dueño.
            </AlertDescription>
          </Alert>
        </Aparece>
      ) : null}

      <Aparece retraso={0.04}>
        <FormularioDePrecios planes={datos.planes} precioMedioMes={datos.precioMedioMes} />
      </Aparece>

      <Aparece retraso={0.08}>
        <VentanaDeCobro
          ventanaPagoDesde={datos.ventanaPagoDesde}
          ventanaPagoHasta={datos.parametros.ventanaPagoHasta}
          diasGracia={datos.parametros.diasGracia}
          diasNuevoSinPago={datos.parametros.diasNuevoSinPago}
        />
      </Aparece>

      <Aparece retraso={0.12}>
        <section className="superficie overflow-hidden">
          <header className="border-b border-border px-5 py-4">
            <h2 className="t-seccion">Motivos de baja</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Las opciones que aparecen al dar de baja a un alumno. Se guardan con la baja para
              poder entender después por qué se va la gente.
            </p>
          </header>

          <ul className="flex flex-wrap gap-1.5 px-5 py-4">
            {datos.motivosBaja
              .filter((m) => m.activo !== false)
              .map((motivo) => (
                <li
                  key={motivo.codigo}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground"
                >
                  {motivo.etiqueta}
                </li>
              ))}
          </ul>

          <p className="hundido border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
            Editar este catálogo todavía no está disponible desde la pantalla.
          </p>
        </section>
      </Aparece>
    </div>
  );
}
