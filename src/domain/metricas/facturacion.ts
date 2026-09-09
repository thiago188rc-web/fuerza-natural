/**
 * Segmentos de un total en dinero — pura, sin I/O. Toma filas YA agregadas
 * por el repositorio (una suma por clave, no registros individuales: a
 * diferencia de demografía, sumar plata sí conviene hacerlo en SQL) y las
 * ordena/etiqueta/calcula porcentaje. Un segmento con 0 pagos no se lista
 * — no tiene sentido mostrar "Billetera virtual: 0%" en un período donde
 * nadie pagó así.
 */

export interface FilaAgregada {
  clave: string;
  total: number;
  cantidad: number;
}

export interface SegmentoImporte {
  clave: string;
  etiqueta: string;
  total: number;
  cantidad: number;
  /** 0 a 100, redondeado, sobre el total del PERÍODO (no del segmento mayor). */
  porcentaje: number;
}

export function segmentosDeImporte(
  filas: readonly FilaAgregada[],
  etiquetas: Record<string, string>,
  orden: readonly string[],
): SegmentoImporte[] {
  const totalGeneral = filas.reduce((acc, f) => acc + f.total, 0);
  const porClave = new Map(filas.map((f) => [f.clave, f]));

  return orden
    .map((clave) => {
      const fila = porClave.get(clave);
      const total = fila?.total ?? 0;
      return {
        clave,
        etiqueta: etiquetas[clave] ?? clave,
        total,
        cantidad: fila?.cantidad ?? 0,
        porcentaje: totalGeneral === 0 ? 0 : Math.round((total / totalGeneral) * 100),
      };
    })
    .filter((s) => s.cantidad > 0);
}
