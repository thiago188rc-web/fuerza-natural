/**
 * "¿Qué día es hoy en el gimnasio?" es la ÚNICA función del dominio que
 * necesita conocer la zona horaria — y es la única que puede tocar
 * `Date`/`Intl`. El resto del dominio trabaja exclusivamente con fechas
 * civiles como strings ('2026-09-07') y períodos ('2026-09'); nunca con
 * objetos Date. Esto elimina de raíz la clase de bug más común y más
 * difícil de detectar en este tipo de sistema: un pago registrado a la
 * noche que el servidor guarda con la fecha del día siguiente en UTC.
 * SPEC V1 §14.1.
 *
 * PROHIBIDO usar `new Date()` en el navegador (ni en ningún otro lugar del
 * dominio) para lógica de negocio — "hoy" siempre se calcula en el
 * servidor, en la TZ del gimnasio, y siempre a través de esta función.
 */
export function hoyISO(timezone: string, ahoraUTC: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // "en-CA" formatea como YYYY-MM-DD directamente — evita parsear un
  // formato localizado ambiguo.
  return formatter.format(ahoraUTC);
}
