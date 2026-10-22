/**
 * El catálogo de motivos de baja del gimnasio (`gym_settings.motivos_baja`).
 * Puro: recibe el catálogo actual y devuelve el nuevo, sin I/O.
 */

export interface MotivoDelCatalogo {
  codigo: string;
  etiqueta: string;
  orden: number;
  activo: boolean;
}

/** El cajón de sastre del catálogo: siempre al final de la lista. */
export const CODIGO_OTRO = "OTRO";

/**
 * Suma un motivo al catálogo. Si existe "Otro", el nuevo entra justo antes
 * y "Otro" (con lo que viniera después) corre un lugar: "Otro" es la
 * opción de cuando ninguna otra describe la baja, así que leerla antes que
 * "Viaje" o "Enfermedad" obligaría a pasar por ella para encontrar las
 * demás. Sin "Otro", el nuevo va al final.
 *
 * Nada se borra ni cambia de código: las bajas viejas guardan el código
 * del motivo, y tienen que seguir encontrándolo.
 */
export function agregarMotivoAlCatalogo(
  actuales: readonly MotivoDelCatalogo[],
  nuevo: { codigo: string; etiqueta: string },
): MotivoDelCatalogo[] {
  const otro = actuales.find((m) => m.codigo === CODIGO_OTRO);
  if (!otro) {
    const orden = actuales.reduce((max, m) => Math.max(max, m.orden), 0) + 1;
    return [...actuales, { ...nuevo, orden, activo: true }];
  }
  return [
    ...actuales.map((m) => (m.orden >= otro.orden ? { ...m, orden: m.orden + 1 } : m)),
    { ...nuevo, orden: otro.orden, activo: true },
  ];
}
