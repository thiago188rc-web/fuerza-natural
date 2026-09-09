/**
 * Aritmética de fechas CIVILES (strings 'YYYY-MM-DD'), sin zona horaria y
 * sin reloj.
 *
 * Usa `Date.UTC` internamente, y eso NO rompe la regla de que solo
 * `hoy.ts` puede tocar `Date`: la regla existe para que nadie lea el reloj
 * del servidor ni dependa de una zona horaria. Acá no se lee ningún
 * reloj — se construyen fechas a partir de números explícitos, en UTC,
 * donde no existen el horario de verano ni los desfasajes. Las mismas
 * entradas dan siempre las mismas salidas.
 *
 * Todo lo que devuelve son strings 'YYYY-MM-DD', que es el formato en el
 * que viven las fechas en Postgres (`date`) y el que entiende un
 * `<input type="date">`. Nunca se devuelve un `Date`.
 */

function aPartes(iso: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return { anio, mes, dia };
}

function aISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function aUTC(iso: string): number {
  const { anio, mes, dia } = aPartes(iso);
  return Date.UTC(anio, mes - 1, dia);
}

const MS_POR_DIA = 86_400_000;

export function sumarDias(iso: string, dias: number): string {
  return aISO(aUTC(iso) + dias * MS_POR_DIA);
}

/** Días de `desde` a `hasta`. Negativo si `hasta` es anterior. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta) - aUTC(desde)) / MS_POR_DIA);
}

export function primerDiaDelMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function ultimoDiaDelMes(iso: string): string {
  const { anio, mes } = aPartes(iso);
  // Día 0 del mes siguiente = último día de este mes. Resuelve febrero y
  // los años bisiestos sin ninguna tabla.
  return aISO(Date.UTC(anio, mes, 0));
}

export function diasDelMes(iso: string): number {
  return Number(ultimoDiaDelMes(iso).slice(8, 10));
}

/** Posición de una fecha dentro de su mes, de 0 a 1. Alimenta el instrumento. */
export function posicionEnElMes(iso: string): number {
  const dia = Number(iso.slice(8, 10));
  return (dia - 1) / (diasDelMes(iso) - 1);
}

export function sumarMeses(iso: string, meses: number): string {
  const { anio, mes, dia } = aPartes(iso);
  const destino = new Date(Date.UTC(anio, mes - 1 + meses, 1));
  const ultimoDelDestino = new Date(
    Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0),
  ).getUTCDate();
  // Clamp: 31 de enero + 1 mes = 28/29 de febrero, no el 3 de marzo.
  return aISO(
    Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth(), Math.min(dia, ultimoDelDestino)),
  );
}

/** 'YYYY-MM' — la clave del mes, tal como se imputa en `payment_periods`. */
export function claveDeMes(iso: string): string {
  return iso.slice(0, 7);
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "septiembre 2026". Tabla propia en vez de Intl: sin sorpresas de locale. */
export function etiquetaDeMes(iso: string, opciones: { conAnio?: boolean } = {}): string {
  const { anio, mes } = aPartes(iso);
  const nombre = MESES[mes - 1];
  return opciones.conAnio === false ? nombre : `${nombre} ${anio}`;
}

/** "7 sep" / "7 sep 2025" — compacto, para tablas y timelines. */
export function etiquetaCorta(iso: string, anioActual?: string): string {
  const { anio, mes, dia } = aPartes(iso);
  const abreviado = MESES[mes - 1].slice(0, 3);
  const mismoAnio = anioActual ? anioActual.slice(0, 4) === String(anio) : false;
  return mismoAnio ? `${dia} ${abreviado}` : `${dia} ${abreviado} ${anio}`;
}

/** "hace 3 días", "hoy", "en 5 días". Para el historial y las alertas. */
export function distanciaRelativa(desde: string, hasta: string): string {
  const dias = diasEntre(desde, hasta);
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias === -1) return "ayer";
  if (dias > 0) return `en ${dias} días`;
  const atras = Math.abs(dias);
  if (atras < 30) return `hace ${atras} días`;
  const meses = Math.round(atras / 30);
  return meses === 1 ? "hace un mes" : `hace ${meses} meses`;
}

/** 0 = domingo … 6 = sábado. Determinista: no lee el reloj ni la zona. */
export function diaDeLaSemana(iso: string): number {
  return new Date(aUTC(iso)).getUTCDay();
}

/** Edad en años cumplidos a la fecha `hoy`. Aritmética civil, sin reloj. */
export function edadEnAnios(nacimiento: string, hoy: string): number {
  const n = aPartes(nacimiento);
  const h = aPartes(hoy);
  let edad = h.anio - n.anio;
  if (h.mes < n.mes || (h.mes === n.mes && h.dia < n.dia)) edad -= 1;
  return edad;
}

/** El lunes de la semana que contiene `iso`. Semana lunes→domingo. */
export function primerDiaDeLaSemana(iso: string): string {
  const dia = diaDeLaSemana(iso); // 0 domingo … 6 sábado
  const desdeElLunes = dia === 0 ? 6 : dia - 1;
  return sumarDias(iso, -desdeElLunes);
}

export function ultimoDiaDeLaSemana(iso: string): string {
  return sumarDias(primerDiaDeLaSemana(iso), 6);
}

export function sumarSemanas(iso: string, semanas: number): string {
  return sumarDias(iso, semanas * 7);
}

export function primerDiaDelAnio(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

export function ultimoDiaDelAnio(iso: string): string {
  return `${iso.slice(0, 4)}-12-31`;
}
