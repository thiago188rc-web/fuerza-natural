import { NumeroAnimado } from "@/components/motion/primitivas";
import { Importe } from "@/components/importe";
import type { Metricas } from "@/use-cases/metricas/consultas";
import { cn } from "@/lib/utils";

type Resumen = NonNullable<Metricas["resumenDelMes"]>;

/**
 * EL RESUMEN DEL MES, arriba de todo en Métricas: lo que el dueño quiere
 * leer de un vistazo (ver domain/metricas/resumen.ts). Cuatro números y
 * nada más; el detalle de cada uno sigue más abajo en la página.
 *
 * Cuando no hay contra qué comparar se dice eso, con palabras, en vez de
 * mostrar un "+100%" contra un mes que el sistema no tiene.
 */
export function ResumenDelMes({ resumen, moneda }: { resumen: Resumen; moneda: string }) {
  const {
    etiquetaMes,
    etiquetaMesAnterior,
    esMesEnCurso,
    facturado,
    facturadoMesAnterior,
    variacionFacturado,
    altas,
    bajas,
    activos,
    diferenciaActivos,
    alDia,
  } = resumen;

  return (
    <section className="superficie p-5" aria-labelledby="resumen-del-mes">
      <h2 id="resumen-del-mes" className="t-rotulo">
        Resumen · {etiquetaMes}
      </h2>

      <dl className={cn("mt-4 grid grid-cols-2 gap-x-6 gap-y-6", alDia ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        <Indicador etiqueta={`Facturación vs ${etiquetaMesAnterior}`}>
          <dd
            className={cn(
              "t-cifra mt-1.5 text-[1.75rem]",
              variacionFacturado === null
                ? "text-muted-foreground"
                : variacionFacturado >= 0
                  ? "text-cubierto"
                  : "text-descubierto",
            )}
          >
            {variacionFacturado === null ? "—" : `${variacionFacturado >= 0 ? "+" : "−"}${Math.abs(variacionFacturado)}%`}
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            <Importe valor={facturado} moneda={moneda} />{" "}
            {variacionFacturado === null ? (
              <>· sin pagos de {etiquetaMesAnterior} para comparar</>
            ) : (
              <>
                contra <Importe valor={facturadoMesAnterior} moneda={moneda} />
                {esMesEnCurso ? " a esta altura" : ""}
              </>
            )}
          </dd>
        </Indicador>

        <Indicador etiqueta="Bajas">
          <dd className={cn("t-cifra mt-1.5 text-[1.75rem]", bajas > 0 && "text-descubierto")}>
            <NumeroAnimado valor={bajas} />
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            {altas} {altas === 1 ? "alta" : "altas"} en el mes
          </dd>
        </Indicador>

        <Indicador etiqueta="Alumnos activos">
          <dd className="t-cifra mt-1.5 text-[1.75rem]">
            <NumeroAnimado valor={activos} />
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            {diferenciaActivos === null
              ? `sin datos de ${etiquetaMesAnterior}`
              : diferenciaActivos === 0
                ? `igual que a fin de ${etiquetaMesAnterior}`
                : `${diferenciaActivos > 0 ? "+" : "−"}${Math.abs(diferenciaActivos)} vs fin de ${etiquetaMesAnterior}`}
          </dd>
        </Indicador>

        {alDia ? (
          <Indicador etiqueta="Al día con la cuota">
            <dd className="mt-1.5 flex items-center gap-3">
              <Anillo porcentaje={alDia.porcentaje} />
              <span className="t-cifra text-[1.75rem]">
                <NumeroAnimado valor={alDia.porcentaje} />%
              </span>
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              {alDia.cubiertos} ya pagaron
              {alDia.enPlazo > 0 ? ` · ${alDia.enPlazo} en plazo` : ""}
              {alDia.vencidos > 0 ? (
                <>
                  {" · "}
                  <span className="text-descubierto">{alDia.vencidos} vencidos</span>
                </>
              ) : null}
            </dd>
          </Indicador>
        ) : null}
      </dl>
    </section>
  );
}

function Indicador({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
      {children}
    </div>
  );
}

/** Anillo de progreso. Decorativo: el número está al lado, en texto. */
function Anillo({ porcentaje }: { porcentaje: number }) {
  const radio = 15;
  const circunferencia = 2 * Math.PI * radio;
  const lleno = (Math.min(Math.max(porcentaje, 0), 100) / 100) * circunferencia;
  return (
    <svg viewBox="0 0 36 36" className="size-9 shrink-0 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={radio} fill="none" strokeWidth="4" className="stroke-muted" />
      <circle
        cx="18"
        cy="18"
        r={radio}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${lleno} ${circunferencia}`}
        style={{ stroke: "var(--cubierto)" }}
      />
    </svg>
  );
}
