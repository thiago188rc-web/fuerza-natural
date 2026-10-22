"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowUp, ArrowUpDown, Receipt } from "lucide-react";
import type { PagoDelHistorial } from "@/use-cases/pagos/consultas";
import { ETIQUETA_MODALIDAD, type Modalidad } from "@/domain/pagos/modalidad";
import { pagosPorDia } from "@/domain/pagos/pagos-por-dia";
import { etiquetaCorta } from "@/domain/fechas/calendario";
import { diaCorto } from "@/lib/formato";
import { DURACION, SALIDA } from "@/components/motion/tokens";
import { BotonLink } from "@/components/boton-link";
import { BotonWhatsapp } from "@/components/boton-whatsapp";
import { mensajeConfirmacionDePago } from "@/lib/mensajes-whatsapp";
import { Importe } from "@/components/importe";
import { AnularPago } from "@/components/features/pagos/anular-pago";
import { cn } from "@/lib/utils";

/**
 * EL HISTORIAL — una tabla financiera, con la disciplina de una.
 *
 *   · Los importes a la derecha, en mono tabular, con el "$" más liviano
 *     que la cifra. Una columna de plata se lee de derecha a izquierda:
 *     primero los millares, después el resto.
 *   · Las líneas divisorias apagadas y el encabezado hundido: la
 *     estructura se ve, pero no compite con los números.
 *   · El encabezado se queda pegado al hacer scroll. Con cuarenta filas,
 *     perder de vista qué columna es "Cubre" es perder la tabla.
 *
 * Ordenada por fecha, la tabla es EL MES COMPLETO: una franja por cada día
 * del 1 al último (28, 29, 30 o 31, según el mes), con lo que se cobró ese
 * día — o "Sin pagos". Un día sin cobros también es información, y antes
 * no aparecía. Ordenada por nombre es una lista de pagos, sin días vacíos:
 * ahí lo que se busca es a una persona, no un día.
 *
 * La columna que la mayoría de los sistemas no tiene es "Cubre": el
 * período real. Sin ella, "$65.000 el 3 de septiembre" no dice si pagó
 * septiembre, agosto atrasado o los primeros quince días de octubre —y esa
 * es exactamente la pregunta que se hace quien revisa el historial.
 *
 * Un pago anulado NO desaparece: se muestra tachado y con su motivo. El
 * historial es un registro contable, no una lista de lo que quedó lindo.
 * Quien puede anular (hoy, el DUENO) ve "Anular" debajo del importe.
 *
 * La forma de pago ya no se muestra: el dueño pidió sacarla del cobro
 * (2026-10-22), así que los pagos nuevos no la tienen. Los viejos la
 * conservan en la base.
 */
export function TablaDePagos({
  pagos,
  rango,
  moneda,
  hoy,
  puedeAnular = false,
  ordenarPor = "fecha",
  direccion = "asc",
}: {
  pagos: PagoDelHistorial[];
  /** El mes que se está mirando: de acá salen los días, haya pagos o no. */
  rango: { desde: string; hasta: string };
  moneda: string;
  hoy: string;
  puedeAnular?: boolean;
  ordenarPor?: "fecha" | "nombre";
  direccion?: "asc" | "desc";
}) {
  const quieto = useReducedMotion();
  const searchParams = useSearchParams();

  /** Tocar una columna ordenable: si ya era esa, invierte; si es otra, arranca ascendente (día 1 o A→Z). */
  function hrefOrdenar(campo: "fecha" | "nombre"): string {
    const params = new URLSearchParams(searchParams.toString());
    const yaEsEsta = ordenarPor === campo;
    const nuevaDireccion = yaEsEsta ? (direccion === "desc" ? "asc" : "desc") : "asc";
    params.set("orden", campo);
    params.set("dir", nuevaDireccion);
    return `?${params.toString()}`;
  }

  if (pagos.length === 0) {
    return (
      <section className="superficie flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="grid size-10 place-items-center rounded-full text-muted-foreground ring-1 ring-border">
          <Receipt className="size-4.5" strokeWidth={1.75} />
        </span>
        <h2 className="t-seccion mt-4">No hay pagos en este mes</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Probá con otro mes, o registrá el primero.
        </p>
        <BotonLink href="/pagos/nuevo" className="mt-5">
          Registrar pago
        </BotonLink>
      </section>
    );
  }

  const porDia = ordenarPor === "fecha";
  const dias = porDia ? pagosPorDia(pagos, rango, direccion) : null;

  // Dónde arranca cada día en la tabla entera: la entrada escalonada corta
  // en la fila 14 de la tabla, no en la 14 de cada día.
  const inicioDeCadaDia: number[] = [];
  let filasAntes = 0;
  for (const dia of dias ?? []) {
    inicioDeCadaDia.push(filasAntes);
    filasAntes += dia.pagos.length;
  }

  const fila = (pago: PagoDelHistorial, indice: number) => (
    <FilaDePago
      key={pago.id}
      pago={pago}
      indice={indice}
      quieto={quieto}
      moneda={moneda}
      hoy={hoy}
      puedeAnular={puedeAnular}
      conFecha={!porDia}
    />
  );

  return (
    <section className="superficie overflow-hidden">
      {/* En pantalla chica no se manda la tabla entera a un scroll lateral:
          el importe quedaba fuera de la vista, que es lo primero que se
          viene a mirar. Se caen "Modalidad" y "Cubre" —el período reaparece
          bajo el nombre, y "1/2 mes" solo cuando es la excepción— y lo que
          queda entra en 375px. De `sm` para arriba vuelve la tabla
          completa. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm sm:min-w-[40rem]">
          <caption className="sr-only">
            {porDia
              ? "Pagos del mes, día por día, incluidos los días sin pagos"
              : "Pagos registrados en el período consultado"}
          </caption>
          {/* Sin `top-14`: dentro de un `overflow-x-auto` el sticky se ancla
              a ese contenedor, no a la página, y el desplazamiento de 3.5rem
              en pantalla chica bajaba el encabezado encima de las primeras
              filas en vez de pegarlo arriba. */}
          <thead className="hundido sticky top-0 z-10">
            <tr className="border-b border-border text-left">
              <Encabezado className="w-[4.5rem] pl-5">
                <EncabezadoOrdenable
                  href={hrefOrdenar("fecha")}
                  activo={ordenarPor === "fecha"}
                  direccion={direccion}
                >
                  Fecha
                </EncabezadoOrdenable>
              </Encabezado>
              <Encabezado>
                <EncabezadoOrdenable
                  href={hrefOrdenar("nombre")}
                  activo={ordenarPor === "nombre"}
                  direccion={direccion}
                >
                  Alumno
                </EncabezadoOrdenable>
              </Encabezado>
              <Encabezado className="hidden w-[7.5rem] sm:table-cell">Modalidad</Encabezado>
              <Encabezado className="hidden w-[9.5rem] sm:table-cell">Cubre</Encabezado>
              <Encabezado className="w-[7.5rem] pr-3 text-right">Importe</Encabezado>
              <Encabezado className="w-9 pr-5">
                <span className="sr-only">WhatsApp</span>
              </Encabezado>
            </tr>
          </thead>

          {dias ? (
            dias.map((dia, d) => {
              const futuro = dia.fecha > hoy;
              return (
                <tbody key={dia.fecha} className="border-b border-border last:border-0">
                  <tr className={cn("bg-muted/40", futuro && "opacity-60")}>
                    <th
                      scope="rowgroup"
                      colSpan={6}
                      className="px-5 py-1.5 text-left text-xs font-normal"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span
                          className={cn(
                            "tabular font-mono capitalize",
                            dia.cantidad > 0 ? "font-medium text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {diaCorto(dia.fecha)}
                          {dia.fecha === hoy ? (
                            <span className="ml-1.5 font-sans text-[0.7rem] font-medium text-verde-fuerte normal-case">
                              hoy
                            </span>
                          ) : null}
                        </span>
                        <span className="tabular text-muted-foreground">
                          {dia.cantidad > 0 ? (
                            <>
                              {dia.cantidad} {dia.cantidad === 1 ? "pago" : "pagos"} ·{" "}
                              <span className="font-mono text-foreground">
                                <Importe valor={dia.total} moneda={moneda} simboloClassName="text-[0.65rem]" />
                              </span>
                            </>
                          ) : futuro ? (
                            "—"
                          ) : dia.pagos.length > 0 ? (
                            "Solo anulados"
                          ) : (
                            "Sin pagos"
                          )}
                        </span>
                      </span>
                    </th>
                  </tr>
                  {dia.pagos.map((pago, j) => fila(pago, inicioDeCadaDia[d]! + j))}
                </tbody>
              );
            })
          ) : (
            <tbody>{pagos.map((pago, i) => fila(pago, i))}</tbody>
          )}
        </table>
      </div>
    </section>
  );
}

function FilaDePago({
  pago,
  indice,
  quieto,
  moneda,
  hoy,
  puedeAnular,
  conFecha,
}: {
  pago: PagoDelHistorial;
  indice: number;
  quieto: boolean | null;
  moneda: string;
  hoy: string;
  puedeAnular: boolean;
  /** En la vista por día la fecha ya está en la franja del día. */
  conFecha: boolean;
}) {
  return (
    <motion.tr
      initial={quieto || indice > 14 ? false : { opacity: 0, y: 4 }}
      // La opacidad va en `animate`: motion la fija en línea y una
      // clase `opacity-*` quedaba sin efecto.
      animate={{ opacity: pago.anulado ? 0.55 : 1, y: 0 }}
      transition={{
        duration: DURACION.rapido,
        ease: SALIDA,
        delay: quieto ? 0 : Math.min(indice, 14) * 0.016,
      }}
      className="fila border-t border-border/60"
    >
      <td className="tabular py-3 pl-5 align-top font-mono text-xs whitespace-nowrap text-muted-foreground">
        {conFecha ? etiquetaCorta(pago.fechaPago, hoy) : null}
      </td>

      <td className="py-3 pr-3 align-top">
        <Link
          href={`/alumnos/${pago.studentId}`}
          className={cn(
            "rounded-sm font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none",
            pago.anulado && "line-through",
          )}
        >
          {pago.nombre} {pago.apellido}
        </Link>
        {pago.marca ? <MarcaDeMovimiento marca={pago.marca} /> : null}
        <span className="block text-xs text-muted-foreground">{pago.planNombreSnapshot}</span>
        {pago.cubreDesde && pago.cubreHasta ? (
          <span className="tabular block font-mono text-[0.7rem] whitespace-nowrap text-muted-foreground/80 sm:hidden">
            {etiquetaCorta(pago.cubreDesde, hoy)} → {etiquetaCorta(pago.cubreHasta, hoy)}
          </span>
        ) : null}
        {pago.modalidad === "MEDIO_MES" ? (
          <span className="mt-1 inline-flex items-center rounded-md bg-revisar-suave px-1.5 py-0.5 text-[0.7rem] text-revisar sm:hidden">
            {ETIQUETA_MODALIDAD.MEDIO_MES}
          </span>
        ) : null}
        {pago.anulado ? (
          <span className="mt-0.5 block text-xs text-descubierto">
            Anulado{pago.anuladoMotivo ? ` · ${pago.anuladoMotivo}` : ""}
          </span>
        ) : pago.nota ? (
          <span className="mt-0.5 block max-w-[18rem] truncate text-xs text-muted-foreground/80">
            {pago.nota}
          </span>
        ) : null}
      </td>

      <td className="hidden py-3 pr-3 align-top whitespace-nowrap sm:table-cell">
        <Modalidad valor={pago.modalidad} />
      </td>

      <td className="tabular hidden py-3 pr-3 align-top font-mono text-xs whitespace-nowrap text-muted-foreground sm:table-cell">
        {pago.cubreDesde && pago.cubreHasta ? (
          <>
            {etiquetaCorta(pago.cubreDesde, hoy)}
            <span className="mx-1 text-border-strong">→</span>
            {etiquetaCorta(pago.cubreHasta, hoy)}
          </>
        ) : (
          "—"
        )}
      </td>

      <td
        className={cn(
          "py-3 pr-3 text-right align-top font-mono text-[0.9375rem] whitespace-nowrap",
          pago.anulado && "line-through",
        )}
      >
        <Importe valor={pago.monto} moneda={moneda} simboloClassName="text-xs" />
        {puedeAnular && !pago.anulado ? (
          <div className="mt-1 flex justify-end font-sans">
            <AnularPago pago={pago} moneda={moneda} alumno={`${pago.nombre} ${pago.apellido}`} />
          </div>
        ) : null}
      </td>

      <td className="py-3 pr-5 align-top">
        {!pago.anulado && pago.cubreHasta ? (
          <BotonWhatsapp
            telefono={pago.telefono}
            mensaje={mensajeConfirmacionDePago({
              nombre: pago.nombre,
              monto: pago.monto,
              moneda,
              modalidad: pago.modalidad,
              planNombre: pago.planNombreSnapshot,
              cubreHasta: pago.cubreHasta,
            })}
            variant="ghost"
            size="icon-sm"
            aria-label={`Enviar WhatsApp a ${pago.nombre} ${pago.apellido}`}
          >
            <span className="sr-only">Enviar WhatsApp</span>
          </BotonWhatsapp>
        ) : null}
      </td>
    </motion.tr>
  );
}

/**
 * La modalidad como texto con una marca, no como píldora de color: el
 * color en este sistema significa cobertura, y una píldora ámbar para
 * "1/2 mes" se leería como "para revisar". La excepción se marca con
 * peso, no con tono.
 */
function Modalidad({ valor }: { valor: string }) {
  const esMedio = valor === "MEDIO_MES";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        esMedio ? "font-medium text-foreground" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-[1.5px]", esMedio ? "bg-foreground" : "bg-border-strong")}
      />
      {ETIQUETA_MODALIDAD[valor as Modalidad] ?? valor}
    </span>
  );
}

function Encabezado({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("t-rotulo py-2.5 pr-3 font-normal", className)}>
      {children}
    </th>
  );
}

/** Un encabezado de columna que es, a la vez, el control para ordenar por ella. */
function EncabezadoOrdenable({
  href,
  activo,
  direccion,
  children,
}: {
  href: string;
  activo: boolean;
  direccion: "asc" | "desc";
  children: React.ReactNode;
}) {
  const Icono = !activo ? ArrowUpDown : direccion === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-verde focus-visible:outline-none",
        activo && "text-foreground",
      )}
    >
      {children}
      <Icono className={cn("size-3", !activo && "text-muted-foreground/50")} strokeWidth={2} />
    </Link>
  );
}

/** "Nuevo" o "Volvió" — el alumno tuvo un ALTA o REACTIVACION en el mismo mes que se está mirando. */
function MarcaDeMovimiento({ marca }: { marca: "NUEVO" | "VOLVIO" }) {
  return (
    <span
      className={cn(
        "ml-1.5 inline-flex items-center rounded-md px-1.5 py-0.5 align-middle text-[0.65rem] font-medium",
        marca === "NUEVO" ? "bg-verde-suave text-verde-fuerte" : "bg-serie-1/15 text-serie-1",
      )}
    >
      {marca === "NUEVO" ? "Nuevo" : "Volvió"}
    </span>
  );
}
