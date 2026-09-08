"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

/**
 * LA BANDA DEL MES — la pieza firma de NEXA GYM OS.
 *
 * Un gimnasio se opera por ciclos mensuales. La pregunta que el dueño se
 * hace todos los días no es "¿quién debe?" sino "¿cómo viene el mes?".
 *
 * Esta pieza la contesta con DOS INSTRUMENTOS APILADOS sobre la misma
 * escala de 0 a 100:
 *
 *   · arriba, EL TIEMPO: una regla fina con la marca de hoy.
 *   · abajo, LA POBLACIÓN: una banda donde cada marca vertical es UNA
 *     PERSONA del padrón, pintada según su estado de cobertura.
 *
 * Por qué una marca por persona y no una barra de progreso: una barra
 * dice "69%" —un número que hay que traducir—. La banda dice "estas
 * personas están cubiertas y estas no", y el ojo lee la proporción antes
 * que el número. Cuando el gimnasio está sano la banda está verde; cuando
 * no, la cola roja se ve desde el otro lado del escritorio. Es la
 * identidad de Fuerza Natural funcionando como dato.
 *
 * Y comparar los dos instrumentos es la lectura completa: si pasó un
 * cuarto del mes y la banda ya está verde en dos tercios, va bien. Si
 * pasó el 70% del mes y la banda sigue mayormente gris, hay un problema
 * —y se ve sin leer un solo número—.
 *
 * Ningún dashboard genérico tiene esto porque ningún dashboard genérico
 * tiene esta regla de negocio: la cobertura es por período real, no
 * "último pago + 30 días" (docs/REGLAS-DE-NEGOCIO.md §5).
 */

/**
 * A partir de acá se dibujan bloques proporcionales en vez de una marca
 * por persona. Con 300 alumnos las marcas ya son de 1px y la textura es
 * idéntica a un bloque sólido; seguir emitiendo nodos sería pagar DOM por
 * un detalle que nadie puede ver.
 */
const TOPE_DE_MARCAS = 140;

type Tramo = { clave: "CUBIERTO" | "REVISAR" | "DESCUBIERTO"; cantidad: number };

const COLOR: Record<Tramo["clave"], string> = {
  CUBIERTO: "bg-cubierto",
  REVISAR: "bg-revisar",
  DESCUBIERTO: "bg-descubierto",
};

const ETIQUETA: Record<Tramo["clave"], string> = {
  CUBIERTO: "cubiertos",
  REVISAR: "para revisar",
  DESCUBIERTO: "sin cubrir",
};

const TEXTO: Record<Tramo["clave"], string> = {
  CUBIERTO: "text-cubierto",
  REVISAR: "text-revisar",
  DESCUBIERTO: "text-descubierto",
};

export function InstrumentoDelMes({
  etiquetaMes,
  posicionDeHoy,
  diaDeHoy,
  diasDelMes,
  cubiertos,
  enRevision,
  descubiertos,
  activos,
  className,
}: {
  etiquetaMes: string;
  /** 0 a 1: dónde cae hoy dentro del mes. */
  posicionDeHoy: number;
  diaDeHoy: number;
  diasDelMes: number;
  cubiertos: number;
  enRevision: number;
  descubiertos: number;
  activos: number;
  className?: string;
}) {
  const quieto = useReducedMotion();
  const [resaltado, setResaltado] = useState<Tramo["clave"] | null>(null);

  const proporcion = activos > 0 ? cubiertos / activos : 0;
  const porcentaje = Math.round(proporcion * 100);
  const hoy = Math.max(0, Math.min(1, posicionDeHoy));

  const tramos: Tramo[] = [
    { clave: "CUBIERTO", cantidad: cubiertos },
    { clave: "REVISAR", cantidad: enRevision },
    { clave: "DESCUBIERTO", cantidad: descubiertos },
  ];

  return (
    <section className={cn("relative", className)} aria-label={`Cobertura de ${etiquetaMes}`}>
      <div className="grid gap-7 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
        {/* --- LA LECTURA ------------------------------------------------
            La columna de la izquierda es la respuesta en palabras y en una
            cifra. La de la derecha es la misma respuesta dibujada. */}
        <div className="min-w-0">
          <p className="t-rotulo">Ciclo en curso</p>
          <h2 className="t-titulo mt-1.5 text-[1.375rem] capitalize sm:text-2xl">{etiquetaMes}</h2>

          <p className="mt-5 flex items-baseline gap-1">
            <span className="t-cifra text-[3.25rem] sm:text-[3.75rem]">{porcentaje}</span>
            {/* La unidad va más chica y más apagada que el valor: es la
                disciplina numérica de un producto financiero — el dato es
                el número, "%" solo lo califica. */}
            <span className="t-cifra text-xl text-muted-foreground sm:text-2xl">%</span>
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            <span className="tabular font-medium text-foreground">{cubiertos}</span> de{" "}
            <span className="tabular">{activos}</span> activos con el mes cubierto
          </p>
        </div>

        {/* --- LOS INSTRUMENTOS ---------------------------------------- */}
        <div className="min-w-0">
          <ReglaDelMes
            hoy={hoy}
            diaDeHoy={diaDeHoy}
            diasDelMes={diasDelMes}
            etiquetaMes={etiquetaMes}
            quieto={quieto}
          />

          <Banda
            tramos={tramos}
            activos={activos}
            resaltado={resaltado}
            quieto={quieto}
            className="mt-4"
          />

          <Leyenda
            tramos={tramos}
            activos={activos}
            resaltado={resaltado}
            onResaltar={setResaltado}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * EL TIEMPO. Una regla de 1px con las semanas marcadas y hoy en verde.
 * Fina a propósito: es el eje de referencia, no el dato. Si tuviera el
 * mismo peso que la banda, competirían.
 */
function ReglaDelMes({
  hoy,
  diaDeHoy,
  diasDelMes,
  etiquetaMes,
  quieto,
}: {
  hoy: number;
  diaDeHoy: number;
  diasDelMes: number;
  etiquetaMes: string;
  quieto: boolean | null;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="t-rotulo">El mes</p>
        <p className="tabular font-mono text-[0.7rem] text-muted-foreground">
          día <span className="text-foreground">{diaDeHoy}</span> de {diasDelMes}
        </p>
      </div>

      <div className="relative mt-2.5 h-6">
        {/* El riel y sus marcas semanales. */}
        <div className="absolute top-3 right-0 left-0 h-px bg-border-strong" />
        {[0, 0.25, 0.5, 0.75, 1].map((m) => (
          <span
            key={m}
            aria-hidden
            className="absolute top-3 h-1.5 w-px bg-border-strong"
            style={{ left: `${m * 100}%` }}
          />
        ))}

        {/* HOY. La única marca de tiempo que importa, y la única aparición
            del verde de marca en este instrumento. */}
        <motion.div
          className="pointer-events-none absolute top-0 z-10"
          style={{ left: `${hoy * 100}%` }}
          initial={quieto ? false : { opacity: 0, scaleY: 0.4 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: DURACION.normal, ease: SALIDA, delay: 0.32 }}
        >
          <span className="block h-[22px] w-0.5 -translate-x-1/2 rounded-full bg-verde" />
        </motion.div>

        {/* La etiqueta se ancla al borde correcto para no salirse de la
            caja cuando hoy cae al principio o al final del mes. */}
        <span
          className="tabular absolute top-[1.375rem] font-mono text-[0.7rem] whitespace-nowrap text-verde"
          style={
            hoy > 0.82
              ? { right: `${(1 - hoy) * 100}%`, transform: "translateX(0)" }
              : { left: `${hoy * 100}%`, transform: hoy < 0.06 ? "none" : "translateX(-50%)" }
          }
        >
          hoy
        </span>
        <span className="sr-only">
          Hoy es el día {diaDeHoy} de {diasDelMes} de {etiquetaMes}.
        </span>
      </div>
    </div>
  );
}

/**
 * LA POBLACIÓN. Una marca por alumno activo, agrupadas por estado.
 *
 * `scaleY` y no `height`: escalar lo compone la GPU, cambiar el alto
 * fuerza layout en cada frame y con 300 marcas eso se ve. El escalonado
 * total está acotado a 260ms sin importar cuántas marcas haya — la
 * cascada sugiere que se está midiendo algo, no obliga a esperarla.
 */
function Banda({
  tramos,
  activos,
  resaltado,
  quieto,
  className,
}: {
  tramos: Tramo[];
  activos: number;
  resaltado: Tramo["clave"] | null;
  quieto: boolean | null;
  className?: string;
}) {
  const id = useId();

  if (activos === 0) {
    return (
      <div
        className={cn(
          "hundido flex h-11 items-center justify-center rounded-md border border-border",
          className,
        )}
      >
        <p className="text-xs text-muted-foreground">Todavía no hay alumnos activos</p>
      </div>
    );
  }

  const porMarcas = activos <= TOPE_DE_MARCAS;

  return (
    <div className={cn("relative", className)}>
      {porMarcas ? (
        <div className="flex h-11 items-stretch gap-px sm:gap-[2px]">
          {tramos.flatMap((tramo, t) =>
            Array.from({ length: tramo.cantidad }).map((_, i) => {
              const indice = tramos.slice(0, t).reduce((n, x) => n + x.cantidad, 0) + i;
              const atenuada = resaltado !== null && resaltado !== tramo.clave;
              return (
                <motion.span
                  key={`${id}-${tramo.clave}-${i}`}
                  aria-hidden
                  className={cn("min-w-px flex-1 origin-bottom rounded-[1.5px]", COLOR[tramo.clave])}
                  initial={quieto ? false : { scaleY: 0.25, opacity: 0 }}
                  // La atenuación va por `animate` y no por una clase: motion
                  // escribe `opacity` inline y una clase nunca le ganaría.
                  animate={{ scaleY: 1, opacity: atenuada ? 0.18 : 1 }}
                  transition={{
                    duration: DURACION.normal,
                    ease: SALIDA,
                    // El escalonado es solo para la entrada; al atenuar,
                    // todas las marcas responden a la vez.
                    delay: quieto || resaltado !== null ? 0 : (indice / activos) * 0.26,
                    opacity: { duration: DURACION.rapido, ease: SALIDA },
                  }}
                />
              );
            }),
          )}
        </div>
      ) : (
        /* Padrón grande: bloques proporcionales. Misma lectura, sin
           emitir un nodo por persona. */
        <div className="flex h-11 items-stretch gap-[2px]">
          {tramos
            .filter((t) => t.cantidad > 0)
            .map((tramo) => (
              <motion.span
                key={tramo.clave}
                aria-hidden
                className={cn("origin-bottom rounded-[1.5px]", COLOR[tramo.clave])}
                style={{ flexGrow: tramo.cantidad, flexBasis: 0 }}
                initial={quieto ? false : { scaleY: 0.25, opacity: 0 }}
                animate={{
                  scaleY: 1,
                  opacity: resaltado !== null && resaltado !== tramo.clave ? 0.18 : 1,
                }}
                transition={{
                  duration: DURACION.pausado,
                  ease: SALIDA,
                  opacity: { duration: DURACION.rapido, ease: SALIDA },
                }}
              />
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * La leyenda. No es decorativa: pasar el mouse o el foco por una entrada
 * apaga el resto de la banda, que es la forma más directa de contestar
 * "¿cuáles de estas marcas son las que me faltan?".
 */
function Leyenda({
  tramos,
  activos,
  resaltado,
  onResaltar,
}: {
  tramos: Tramo[];
  activos: number;
  resaltado: Tramo["clave"] | null;
  onResaltar: (clave: Tramo["clave"] | null) => void;
}) {
  return (
    <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
      {tramos.map((tramo) => (
        <div
          key={tramo.clave}
          className="group flex cursor-default items-baseline gap-2 rounded-md px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-verde"
          tabIndex={0}
          onMouseEnter={() => onResaltar(tramo.clave)}
          onMouseLeave={() => onResaltar(null)}
          onFocus={() => onResaltar(tramo.clave)}
          onBlur={() => onResaltar(null)}
        >
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 translate-y-[-1px] rounded-[2px] transition-opacity duration-200",
              COLOR[tramo.clave],
              resaltado !== null && resaltado !== tramo.clave && "opacity-30",
            )}
          />
          <dt className="sr-only">{ETIQUETA[tramo.clave]}</dt>
          <dd className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "tabular font-mono text-sm font-medium transition-colors duration-200",
                resaltado === tramo.clave ? TEXTO[tramo.clave] : "text-foreground",
              )}
            >
              {tramo.cantidad}
            </span>
            <span className="text-xs text-muted-foreground">{ETIQUETA[tramo.clave]}</span>
          </dd>
        </div>
      ))}

      <div className="ml-auto hidden items-baseline gap-1.5 px-1 py-0.5 sm:flex">
        <span className="tabular font-mono text-sm font-medium">{activos}</span>
        <span className="text-xs text-muted-foreground">activos</span>
      </div>
    </dl>
  );
}

/**
 * La versión por alumno: los tramos REALES que tiene cubiertos en el mes.
 *
 * Acá los segmentos importan de verdad. Un "1/2 MES" del 7 al 21 se ve
 * como un bloque en el medio del riel — que es exactamente lo que pasó, y
 * lo que una columna de texto "último pago: 7/9" no puede mostrar.
 */
export function BarraDeCobertura({
  segmentos,
  posicionDeHoy,
  estado,
  className,
  titulo,
}: {
  segmentos: readonly { inicio: number; fin: number }[];
  posicionDeHoy: number;
  estado: "CUBIERTO" | "REVISAR" | "DESCUBIERTO" | "NO_APLICA";
  className?: string;
  titulo?: string;
}) {
  const quieto = useReducedMotion();
  const color =
    estado === "CUBIERTO"
      ? "bg-cubierto"
      : estado === "REVISAR"
        ? "bg-revisar"
        : estado === "DESCUBIERTO"
          ? "bg-descubierto"
          : "bg-muted-foreground/35";

  return (
    <div
      className={cn(
        "hundido relative h-1.5 w-full overflow-hidden rounded-full",
        className,
      )}
      title={titulo}
      role="img"
      aria-label={titulo ?? "Cobertura del mes"}
    >
      {segmentos.map((s, i) => (
        <motion.span
          key={`${s.inicio}-${s.fin}-${i}`}
          className={cn("absolute inset-y-0 rounded-full", color)}
          style={{ left: `${s.inicio * 100}%`, width: `${Math.max(0, s.fin - s.inicio) * 100}%` }}
          initial={quieto ? false : { opacity: 0, scaleX: 0.4 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: DURACION.normal, ease: SALIDA, delay: 0.05 * i }}
        />
      ))}
      <span
        aria-hidden
        className="absolute inset-y-0 w-px bg-foreground/25"
        style={{ left: `${Math.max(0, Math.min(1, posicionDeHoy)) * 100}%` }}
      />
    </div>
  );
}
