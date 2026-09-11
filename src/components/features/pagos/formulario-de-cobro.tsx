"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, CircleAlert, Loader2, TriangleAlert } from "lucide-react";
import { registrarPagoFormAction } from "@/app/(app)/pagos/actions";
import { ESTADO_PAGO_INICIAL, type EstadoPago } from "@/app/(app)/pagos/estado-formulario";
import type { ContextoDeCobro } from "@/use-cases/pagos/consultas";
import { coberturaDe, ETIQUETA_MODALIDAD, type Modalidad } from "@/domain/pagos/modalidad";
import { etiquetaDeMes, primerDiaDelMes, sumarMeses } from "@/domain/fechas/calendario";
import { Segmentado } from "@/components/segmentado";
import { VistaPreviaDeCobertura } from "./vista-previa-de-cobertura";
import { Senal, TEXTO_DE_ESTADO } from "@/components/features/cobertura/senal";
import { BotonWhatsapp } from "@/components/boton-whatsapp";
import { mensajeConfirmacionDePago } from "@/lib/mensajes-whatsapp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DURACION, OVERLAY, SALIDA } from "@/components/motion/tokens";
import { fechaCompleta, importe, iniciales } from "@/lib/formato";
import { METODOS_PAGO, ETIQUETA_METODO } from "@/schemas/payment";
import { cn } from "@/lib/utils";

/**
 * EL COBRO. Buscar → revisar → elegir → confirmar, sin salir de la
 * pantalla.
 *
 * Tres decisiones que definen esta interfaz:
 *
 *   1. Todo lo que se elige se ve reflejado inmediatamente en el riel de
 *      cobertura. El dueño no confirma un formulario, confirma un
 *      resultado que ya está viendo.
 *   2. La interfaz ADVIERTE y no corrige. Si el importe no coincide con el
 *      precio configurado, lo dice; no lo cambia. Si el período ya está
 *      cubierto, lo muestra; no lo mueve. Ninguna decisión del dueño se
 *      pisa en silencio.
 *   3. Si un precio no está confirmado, el campo queda vacío y se explica
 *      por qué. Inventar un número acá sería inventar una regla de negocio
 *      (docs/REGLAS-DE-NEGOCIO.md §1, §2).
 */
export function FormularioDeCobro({
  contexto,
  claveIdempotencia,
}: {
  contexto: ContextoDeCobro;
  /**
   * Generada en el servidor a propósito: si se generara en el cliente, el
   * primer render del servidor y la hidratación producirían UUID distintos
   * y React marcaría el desajuste. Además vale para toda la vida de esta
   * pantalla, que es justo lo que la hace útil contra el doble envío.
   */
  claveIdempotencia: string;
}) {
  const quieto = useReducedMotion();
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, enviar, enviando] = useActionState(registrarPagoFormAction, ESTADO_PAGO_INICIAL);

  const [modalidad, setModalidad] = useState<Modalidad>("MES_COMPLETO");
  const [fechaPago, setFechaPago] = useState(contexto.hoy);
  const [cubreDesde, setCubreDesde] = useState(contexto.sugerenciaDesde);
  const [montoManual, setMontoManual] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<string>("EFECTIVO");
  const [confirmarSuperposicion, setConfirmar] = useState(false);
  const [superposicionCerrada, setSuperposicionCerrada] = useState<string | null>(null);

  const cobertura = coberturaDe(modalidad, cubreDesde);
  const precioConfigurado =
    modalidad === "MES_COMPLETO" ? contexto.alumno.planPrecio : contexto.precioMedioMes;

  // El importe se DERIVA del precio configurado hasta que el usuario
  // escribe uno propio. Sin efectos: cambiar de modalidad recalcula el
  // valor mostrado, y lo que el usuario tipeó gana siempre.
  const monto = montoManual ?? (precioConfigurado === null ? "" : String(precioConfigurado));
  const montoNumero = Number(monto);
  const difiereDelPrecio =
    precioConfigurado !== null && monto !== "" && Number.isFinite(montoNumero)
      ? Math.abs(montoNumero - precioConfigurado) > 0.5
      : false;

  const yaCubierto = contexto.tramos.some(
    (t) => t.hasta >= cobertura.desde && t.desde <= cobertura.hasta,
  );

  /** Cambiar el período o la modalidad invalida cualquier confirmación previa. */
  function cambiarCobertura(accion: () => void) {
    accion();
    setConfirmar(false);
    setSuperposicionCerrada(null);
  }

  const claveSuperposicion = estado.superposicion
    ? `${estado.superposicion.pedido.desde}..${estado.superposicion.pedido.hasta}`
    : null;
  const mostrarSuperposicion =
    claveSuperposicion !== null && superposicionCerrada !== claveSuperposicion;

  if (estado.ok && estado.registrado) {
    return <Comprobante registrado={estado.registrado} moneda={contexto.moneda} />;
  }

  return (
    <form
      ref={formRef}
      action={enviar}
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start"
    >
      <input type="hidden" name="studentId" value={contexto.alumno.id} />
      <input type="hidden" name="fechaPago" value={fechaPago} />
      <input type="hidden" name="cubreDesde" value={cubreDesde} />
      <input type="hidden" name="idempotencyKey" value={claveIdempotencia} />
      <input
        type="hidden"
        name="confirmarSuperposicion"
        value={confirmarSuperposicion ? "1" : "0"}
      />

      <div className="superficie divide-y divide-border">
        {/* QUÉ SE COBRA */}
        <fieldset className="px-5 py-5">
          <legend className="t-rotulo">
            Modalidad
          </legend>
          <Segmentado
            className="mt-3"
            nombre="modalidad"
            valor={modalidad}
            onCambio={(v) => cambiarCobertura(() => setModalidad(v))}
            opciones={[
              { valor: "MES_COMPLETO", etiqueta: "Mes completo", detalle: "el mes calendario" },
              { valor: "MEDIO_MES", etiqueta: "1/2 mes", detalle: "15 días corridos" },
            ]}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            {modalidad === "MES_COMPLETO"
              ? `Cubre el mes entero con el plan habitual: ${contexto.alumno.planNombre}.`
              : "15 días corridos desde el día que elijas. No cambia el plan habitual del alumno."}
          </p>
        </fieldset>

        {/* DESDE CUÁNDO */}
        <fieldset className="px-5 py-5">
          <legend className="t-rotulo">
            {modalidad === "MES_COMPLETO" ? "Mes que cubre" : "Primer día cubierto"}
          </legend>

          {modalidad === "MES_COMPLETO" ? (
            <div className="mt-3 flex items-center gap-2">
              <PasoDeMes
                direccion="anterior"
                onClick={() =>
                  cambiarCobertura(() =>
                    setCubreDesde(primerDiaDelMes(sumarMeses(cubreDesde, -1))),
                  )
                }
              />
              {/* `aria-live`: las flechas cambian este texto y nada más. Sin
                  esto, quien navega con lector aprieta "Mes siguiente" y no
                  escucha en qué mes quedó. */}
              <span
                aria-live="polite"
                className="tabular flex-1 text-center font-heading text-lg font-semibold capitalize"
              >
                {etiquetaDeMes(cubreDesde)}
              </span>
              <PasoDeMes
                direccion="siguiente"
                onClick={() =>
                  cambiarCobertura(() => setCubreDesde(primerDiaDelMes(sumarMeses(cubreDesde, 1))))
                }
              />
            </div>
          ) : (
            <div className="mt-3">
              <Label htmlFor="cubre-desde" className="sr-only">
                Primer día cubierto
              </Label>
              <Input
                id="cubre-desde"
                type="date"
                value={cubreDesde}
                onChange={(e) => cambiarCobertura(() => setCubreDesde(e.target.value))}
                className="tabular"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Puede empezar cualquier día del mes, no solo el 1 o el 15.
              </p>
            </div>
          )}

          {estado.errores?.cubreDesde ? (
            <p className="mt-2 text-xs text-destructive">{estado.errores.cubreDesde}</p>
          ) : null}
        </fieldset>

        {/* CUÁNTO */}
        <fieldset className="px-5 py-5">
          <legend className="t-rotulo">
            Importe
          </legend>

          <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <div>
              <Label htmlFor="monto" className="sr-only">
                Importe cobrado
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="monto"
                  name="monto"
                  inputMode="numeric"
                  value={monto}
                  onChange={(e) => setMontoManual(e.target.value)}
                  placeholder={precioConfigurado === null ? "A confirmar" : undefined}
                  className="tabular pl-7 font-mono"
                  aria-invalid={Boolean(estado.errores?.monto)}
                />
              </div>
              {estado.errores?.monto ? (
                <p className="mt-1.5 text-xs text-destructive">{estado.errores.monto}</p>
              ) : null}
            </div>

            <div className="flex items-center">
              <AnimatePresence mode="wait" initial={false}>
                {precioConfigurado === null ? (
                  <Aviso key="sin-precio" tono="revisar" quieto={quieto}>
                    El precio de{" "}
                    {modalidad === "MES_COMPLETO"
                      ? `“${contexto.alumno.planNombre}”`
                      : "“1/2 mes”"}{" "}
                    todavía no está confirmado. Ingresá el importe a mano.
                  </Aviso>
                ) : difiereDelPrecio ? (
                  <Aviso key="difiere" tono="neutro" quieto={quieto}>
                    Distinto del precio configurado ({importe(precioConfigurado, contexto.moneda)}).
                    Se guarda lo que pongas.
                  </Aviso>
                ) : montoManual === null ? (
                  <Aviso key="sugerido" tono="neutro" quieto={quieto}>
                    Precio configurado para {ETIQUETA_MODALIDAD[modalidad].toLowerCase()}.
                  </Aviso>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </fieldset>

        {/* CÓMO */}
        <fieldset className="px-5 py-5">
          <legend className="t-rotulo">
            Método
          </legend>

          <div className="mt-3">
            <Label htmlFor="fecha-pago" className="text-xs text-muted-foreground">
              Fecha del pago
            </Label>
            <Input
              id="fecha-pago"
              type="date"
              max={contexto.hoy}
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
              className="tabular mt-1.5"
              aria-invalid={Boolean(estado.errores?.fechaPago)}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Cuándo se cobró de verdad. Cargá un pago atrasado con su fecha real, no con la de
              hoy.
            </p>
            {estado.errores?.fechaPago ? (
              <p className="mt-1.5 text-xs text-destructive">{estado.errores.fechaPago}</p>
            ) : null}
          </div>

          <Segmentado
            className="mt-3"
            size="compacto"
            nombre="metodo"
            valor={metodo}
            onCambio={setMetodo}
            opciones={METODOS_PAGO.map((m) => ({ valor: m, etiqueta: ETIQUETA_METODO[m] }))}
          />

          <div className="mt-4">
            <Label htmlFor="nota" className="text-xs text-muted-foreground">
              Nota (opcional)
            </Label>
            <Input
              id="nota"
              name="nota"
              maxLength={300}
              placeholder="Ej: abonó la diferencia del mes pasado"
              className="mt-1.5"
            />
          </div>
        </fieldset>
      </div>

      {/* LA COLUMNA DE CONFIRMACIÓN — siempre visible, con el resultado
          ya dibujado antes de apretar nada. */}
      <aside className="superficie sticky top-6 divide-y divide-border">
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted font-mono text-xs">
              {iniciales(contexto.alumno.nombre, contexto.alumno.apellido)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {contexto.alumno.nombre} {contexto.alumno.apellido}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {contexto.alumno.planNombre}
                {contexto.alumno.planAcceso === "LIBRE" ? " · acceso libre" : ""}
              </span>
            </span>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-xs">
            <Senal estado={contexto.estado} />
            <span className={cn(TEXTO_DE_ESTADO[contexto.estado])}>{contexto.detalle}</span>
          </p>

          {contexto.alumno.vinculo === "PAUSADO" ? (
            <p className="mt-2 text-xs text-revisar">
              Está pausado. Registrar el pago no cambia su estado.
            </p>
          ) : null}
        </div>

        <div className="px-5 py-4">
          <p className="t-rotulo">
            Va a cubrir
          </p>
          <p className="mt-2 text-sm">
            Del <span className="tabular font-medium">{fechaCompleta(cobertura.desde)}</span> al{" "}
            <span className="tabular font-medium">{fechaCompleta(cobertura.hasta)}</span>
          </p>
          <div className="mt-4">
            <VistaPreviaDeCobertura
              cobertura={cobertura}
              existentes={contexto.tramos}
              hoy={contexto.hoy}
            />
          </div>

          {yaCubierto ? (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-revisar-suave px-2.5 py-2 text-xs text-revisar">
              <TriangleAlert className="mt-px size-3.5 shrink-0" strokeWidth={2} />
              Ya hay cobertura registrada en este período. Podés seguir igual: te vamos a pedir una
              confirmación.
            </p>
          ) : null}
        </div>

        <div className="px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="tabular font-heading text-2xl leading-none font-semibold">
              {monto === "" || !Number.isFinite(montoNumero)
                ? "—"
                : importe(montoNumero, contexto.moneda)}
            </span>
          </div>

          {estado.mensaje ? (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-destructive">
              <CircleAlert className="mt-px size-3.5 shrink-0" strokeWidth={2} />
              {estado.mensaje}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="mt-4 w-full" disabled={enviando}>
            {enviando ? (
              <>
                <Loader2 className="animate-spin" />
                Registrando…
              </>
            ) : (
              "Registrar pago"
            )}
          </Button>
          <p className="mt-2 text-center text-[0.7rem] text-muted-foreground">
            Se registra con fecha {fechaCompleta(fechaPago)}
          </p>
        </div>
      </aside>

      <Dialog
        open={mostrarSuperposicion}
        onOpenChange={(abierto) => {
          if (!abierto) setSuperposicionCerrada(claveSuperposicion);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Este período ya está cubierto</DialogTitle>
            <DialogDescription>
              {estado.superposicion?.alumno} ya tiene cobertura registrada que se superpone con lo
              que estás por cobrar. Puede ser correcto —dos medios meses seguidos, un ajuste—, pero
              conviene mirarlo.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 text-sm">
            {estado.superposicion?.existentes.map((e) => (
              <li
                key={`${e.desde}-${e.hasta}`}
                className="flex items-baseline justify-between gap-3 rounded-lg bg-muted px-3 py-2"
              >
                <span className="tabular">
                  {fechaCompleta(e.desde)} → {fechaCompleta(e.hasta)}
                </span>
                <span className="tabular font-mono text-xs text-muted-foreground">
                  {importe(e.monto, contexto.moneda)}
                </span>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSuperposicionCerrada(claveSuperposicion)}
            >
              Revisar
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmar(true);
                setSuperposicionCerrada(claveSuperposicion);
                // El estado ya cambió para el próximo render; el submit
                // se dispara después, con el input oculto en "1".
                requestAnimationFrame(() => formRef.current?.requestSubmit());
              }}
            >
              Registrar igual
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function PasoDeMes({
  direccion,
  onClick,
}: {
  direccion: "anterior" | "siguiente";
  onClick: () => void;
}) {
  const Icono = direccion === "anterior" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direccion === "anterior" ? "Mes anterior" : "Mes siguiente"}
      className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
    >
      <Icono className="size-4" strokeWidth={2} />
    </button>
  );
}

function Aviso({
  children,
  tono,
  quieto,
}: {
  children: React.ReactNode;
  tono: "revisar" | "neutro";
  quieto: boolean | null;
}) {
  return (
    <motion.p
      initial={quieto ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={quieto ? undefined : { opacity: 0, y: -2 }}
      transition={{ duration: DURACION.rapido, ease: SALIDA }}
      className={cn(
        "text-xs leading-snug",
        tono === "revisar" ? "text-revisar" : "text-muted-foreground",
      )}
    >
      {children}
    </motion.p>
  );
}

/** El comprobante. Lo que quedó registrado, y el camino al siguiente cobro. */
function Comprobante({
  registrado,
  moneda,
}: {
  registrado: NonNullable<EstadoPago["registrado"]>;
  moneda: string;
}) {
  const quieto = useReducedMotion();

  return (
    <motion.div
      initial={quieto ? false : "oculto"}
      animate="visible"
      variants={OVERLAY}
      className="superficie mx-auto max-w-md px-6 py-8 text-center"
    >
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-cubierto-suave text-cubierto">
        <Check className="size-5" strokeWidth={2.25} />
      </span>
      <h2 className="mt-4 font-heading text-lg font-semibold">Pago registrado</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {registrado.alumno} · {ETIQUETA_MODALIDAD[registrado.modalidad as Modalidad]}
      </p>

      <dl className="mt-5 space-y-2 border-t border-border pt-5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Importe</dt>
          <dd className="tabular font-medium">{importe(registrado.monto, moneda)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Cubre</dt>
          <dd className="tabular">
            {fechaCompleta(registrado.cubreDesde)} → {fechaCompleta(registrado.cubreHasta)}
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <BotonWhatsapp
          telefono={registrado.telefono}
          mensaje={mensajeConfirmacionDePago({
            nombre: registrado.alumno.split(" ")[0] ?? registrado.alumno,
            monto: registrado.monto,
            moneda,
            modalidad: registrado.modalidad,
            planNombre: registrado.planNombre,
            cubreHasta: registrado.cubreHasta,
          })}
          size="lg"
        />
        <Link
          href="/pagos/nuevo"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
        >
          Registrar otro pago
        </Link>
        <Link
          href={`/alumnos/${registrado.studentId}`}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none"
        >
          Ver la ficha
        </Link>
      </div>
    </motion.div>
  );
}
