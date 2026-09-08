import { diaDeLaSemana, etiquetaDeMes } from "@/domain/fechas/calendario";

/**
 * Formato de presentación. Vive fuera del dominio a propósito: cómo se
 * ESCRIBE un importe es una decisión de interfaz, no una regla de
 * negocio. El dominio trabaja con números y con strings 'YYYY-MM-DD'.
 */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * "$65.000". Sin centavos: los importes de un gimnasio son redondos, y
 * dos decimales que siempre dicen ",00" son ruido en una columna.
 */
export function importe(valor: number, moneda = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: 0,
  }).format(valor);
}

/** "65.000" — sin símbolo, para cuando el signo ya está en la etiqueta. */
export function numero(valor: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(valor);
}

/** "lunes 7 de septiembre" — el encabezado del día. */
export function fechaLarga(iso: string): string {
  const dia = Number(iso.slice(8, 10));
  return `${DIAS[diaDeLaSemana(iso)]} ${dia} de ${etiquetaDeMes(iso, { conAnio: false })}`;
}

/** "7 de septiembre de 2026" — para fichas y comprobantes. */
export function fechaCompleta(iso: string): string {
  const dia = Number(iso.slice(8, 10));
  return `${dia} de ${etiquetaDeMes(iso)}`.replace(/ (\d{4})$/, " de $1");
}

/** Las iniciales de una persona, para su avatar. */
export function iniciales(nombre: string, apellido: string): string {
  return `${nombre.trim()[0] ?? ""}${apellido.trim()[0] ?? ""}`.toUpperCase();
}
