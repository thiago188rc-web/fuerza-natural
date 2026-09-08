"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { guardarParametrosFormAction } from "@/app/(app)/configuracion/actions";
import { ESTADO_FORMULARIO_INICIAL } from "@/app/(app)/alumnos/estado-formulario";
import { Button } from "@/components/ui/button";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

/**
 * LA VENTANA DE COBRO — los umbrales con los que el sistema decide a quién
 * mostrar como "para revisar" y a quién como "sin cubrir".
 *
 * El formulario dibuja lo que está configurando. Un mes de 30 días con la
 * ventana pintada encima, que se mueve mientras se arrastran los números:
 * "hasta el 10, más 5 de gracia" deja de ser una frase abstracta y pasa a
 * ser una franja que se ve. Es la diferencia entre configurar a ciegas y
 * entender qué se está cambiando.
 *
 * Estos parámetros NO cambian ningún dato: la situación de pago se deriva
 * en cada lectura, así que moverlos cambia lo que se ve hoy y nada más. No
 * hay ningún estado guardado que corregir después.
 */
export function VentanaDeCobro({
  ventanaPagoDesde,
  ventanaPagoHasta,
  diasGracia,
  diasNuevoSinPago,
}: {
  ventanaPagoDesde: number;
  ventanaPagoHasta: number;
  diasGracia: number;
  diasNuevoSinPago: number;
}) {
  const quieto = useReducedMotion();
  const [estado, guardar, guardando] = useActionState(
    guardarParametrosFormAction,
    ESTADO_FORMULARIO_INICIAL,
  );

  const [desde, setDesde] = useState(ventanaPagoDesde);
  const [hasta, setHasta] = useState(ventanaPagoHasta);
  const [gracia, setGracia] = useState(diasGracia);
  const [nuevos, setNuevos] = useState(diasNuevoSinPago);

  // Un mes de 30 días como referencia de dibujo. No es el mes real: es una
  // regla graduada, y usar siempre 30 hace que la franja se lea igual en
  // febrero que en julio.
  const DIAS = 30;
  const limite = Math.min(hasta + gracia, DIAS);
  const errores = estado.errores ?? {};

  return (
    <form action={guardar} className="superficie overflow-hidden">
      <header className="border-b border-border px-5 py-4">
        <h2 className="t-seccion">Ventana de cobro</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Define a partir de qué día del mes un alumno sin pagar deja de estar “para revisar” y
          pasa a “sin cubrir”. No cambia ningún dato guardado: la situación se recalcula sola en
          cada pantalla.
        </p>
      </header>

      <div className="px-5 py-5">
        {/* LA REGLA. El mes entero, con la ventana y la gracia pintadas. */}
        <div className="relative">
          <div className="relative h-9 overflow-hidden rounded-lg bg-muted">
            <motion.div
              className="absolute inset-y-0 bg-cubierto/25"
              animate={{
                left: `${((desde - 1) / DIAS) * 100}%`,
                width: `${((hasta - desde + 1) / DIAS) * 100}%`,
              }}
              transition={{ duration: quieto ? 0 : DURACION.rapido, ease: SALIDA }}
            />
            <motion.div
              className="absolute inset-y-0 bg-revisar/25"
              animate={{
                left: `${(hasta / DIAS) * 100}%`,
                width: `${(Math.max(0, limite - hasta) / DIAS) * 100}%`,
              }}
              transition={{ duration: quieto ? 0 : DURACION.rapido, ease: SALIDA }}
            />
            <motion.div
              className="absolute inset-y-0 right-0 bg-descubierto/20"
              animate={{ left: `${(limite / DIAS) * 100}%` }}
              transition={{ duration: quieto ? 0 : DURACION.rapido, ease: SALIDA }}
            />

            {[10, 20].map((d) => (
              <span
                key={d}
                aria-hidden
                className="absolute inset-y-0 w-px bg-background/60"
                style={{ left: `${(d / DIAS) * 100}%` }}
              />
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between font-mono text-[0.7rem] text-muted-foreground">
            <span className="tabular">día 1</span>
            <span className="tabular">día {DIAS}</span>
          </div>

          <p className="mt-3 text-sm">
            Se espera el pago{" "}
            <span className="font-medium">
              del <span className="tabular">{desde}</span> al{" "}
              <span className="tabular">{hasta}</span>
            </span>
            . Con <span className="tabular font-medium">{gracia}</span>{" "}
            {gracia === 1 ? "día" : "días"} de gracia, quien no pagó aparece como{" "}
            <span className="text-descubierto">sin cubrir</span> a partir del{" "}
            <span className="tabular font-medium">{limite + 1}</span>.
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Aplica solo a quien venía al día. El que arrastra meses sin cubrir aparece igual,
            cualquier día del mes.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Numero
            nombre="ventanaPagoDesde"
            etiqueta="Se cobra desde el día"
            valor={desde}
            onCambio={setDesde}
            min={1}
            max={28}
            error={errores.ventanaPagoDesde}
          />
          <Numero
            nombre="ventanaPagoHasta"
            etiqueta="Hasta el día"
            valor={hasta}
            onCambio={setHasta}
            min={1}
            max={28}
            error={errores.ventanaPagoHasta}
          />
          <Numero
            nombre="diasGracia"
            etiqueta="Días de gracia"
            valor={gracia}
            onCambio={setGracia}
            min={0}
            max={20}
            error={errores.diasGracia}
            ayuda="Margen después de la ventana antes de reclamar."
          />
          <Numero
            nombre="diasNuevoSinPago"
            etiqueta="Tolerancia para altas nuevas"
            valor={nuevos}
            onCambio={setNuevos}
            min={1}
            max={60}
            error={errores.diasNuevoSinPago}
            ayuda="Días sin reclamar a alguien recién dado de alta."
          />
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <div className="min-h-5 text-xs">
          <AnimatePresence mode="wait" initial={false}>
            {estado.mensaje ? (
              <motion.p
                key={estado.mensaje}
                initial={quieto ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={quieto ? undefined : { opacity: 0 }}
                transition={{ duration: DURACION.rapido, ease: SALIDA }}
                role="status"
                className={cn(
                  estado.ok ? "flex items-center gap-1.5 text-cubierto" : "text-destructive",
                )}
              >
                {estado.ok ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                {estado.mensaje}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        <Button type="submit" disabled={guardando}>
          {guardando ? (
            <>
              <Loader2 className="animate-spin" />
              Guardando…
            </>
          ) : (
            "Guardar parámetros"
          )}
        </Button>
      </footer>
    </form>
  );
}

function Numero({
  nombre,
  etiqueta,
  valor,
  onCambio,
  min,
  max,
  error,
  ayuda,
}: {
  nombre: string;
  etiqueta: string;
  valor: number;
  onCambio: (v: number) => void;
  min: number;
  max: number;
  error?: string;
  ayuda?: string;
}) {
  return (
    <div>
      <label htmlFor={nombre} className="block text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={nombre}
        name={nombre}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={valor}
        onChange={(e) => {
          const n = Number(e.target.value);
          onCambio(Number.isFinite(n) ? n : min);
        }}
        aria-invalid={Boolean(error)}
        className="tabular mt-1.5 h-9 w-24 rounded-lg border border-border bg-card px-3 font-mono text-sm transition-colors duration-150 focus-visible:border-verde focus-visible:ring-2 focus-visible:ring-verde/25 focus-visible:outline-none aria-invalid:border-destructive"
      />
      <p className={cn("mt-1.5 text-xs", error ? "text-destructive" : "text-muted-foreground")}>
        {error ?? ayuda ?? `Entre ${min} y ${max}.`}
      </p>
    </div>
  );
}
