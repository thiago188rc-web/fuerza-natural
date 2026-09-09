/**
 * La vista de Métricas (semana/mes/año). Vive separada del caso de uso a
 * propósito: el selector es un Client Component y solo necesita este tipo
 * chiquito — si importara del caso de uso, Next.js arrastraría `postgres`
 * (y sus módulos de Node: `tls`, `net`) al bundle del navegador y el build
 * fallaría (`Module not found: Can't resolve 'tls'`).
 */
export const VISTAS_METRICAS = ["semana", "mes", "anio"] as const;
export type VistaMetricas = (typeof VISTAS_METRICAS)[number];

export function esVistaMetricas(valor: unknown): valor is VistaMetricas {
  return typeof valor === "string" && (VISTAS_METRICAS as readonly string[]).includes(valor);
}
