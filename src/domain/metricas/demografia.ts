import { edadEnAnios } from "@/domain/fechas/calendario";
import { GENEROS, esGenero, etiquetaGenero, type Genero } from "@/domain/alumnos/genero";

/**
 * Demografía de los alumnos — pura, sin I/O. Recibe listas ya traídas por
 * el repositorio y las buckea. "Sin dato" es un segmento más, nunca se
 * excluye ni se reparte entre los demás: ocultarlo daría porcentajes que
 * no explican el 100%.
 */

export const BUCKETS_EDAD = [
  "SIN_DATO",
  "MENOR_18",
  "18_25",
  "26_35",
  "36_45",
  "46_55",
  "56_MAS",
] as const;

export type BucketEdad = (typeof BUCKETS_EDAD)[number];

const ETIQUETAS_BUCKET_EDAD: Record<BucketEdad, string> = {
  SIN_DATO: "Sin dato",
  MENOR_18: "Menos de 18",
  "18_25": "18 a 25",
  "26_35": "26 a 35",
  "36_45": "36 a 45",
  "46_55": "46 a 55",
  "56_MAS": "56 o más",
};

export function etiquetaBucketEdad(bucket: BucketEdad): string {
  return ETIQUETAS_BUCKET_EDAD[bucket];
}

export function bucketDeEdad(fechaNacimiento: string | null, hoy: string): BucketEdad {
  if (!fechaNacimiento) return "SIN_DATO";
  const edad = edadEnAnios(fechaNacimiento, hoy);
  if (edad < 18) return "MENOR_18";
  if (edad <= 25) return "18_25";
  if (edad <= 35) return "26_35";
  if (edad <= 45) return "36_45";
  if (edad <= 55) return "46_55";
  return "56_MAS";
}

export interface SegmentoDistribucion {
  clave: string;
  etiqueta: string;
  cantidad: number;
  /** 0 a 100, redondeado. Los segmentos con 0 alumnos no se listan. */
  porcentaje: number;
}

function distribucion<T extends string>(
  valores: readonly T[],
  claves: readonly T[],
  etiqueta: (clave: T) => string,
): SegmentoDistribucion[] {
  const total = valores.length;
  const conteo = new Map<T, number>();
  for (const v of valores) conteo.set(v, (conteo.get(v) ?? 0) + 1);

  return claves
    .map((clave) => {
      const cantidad = conteo.get(clave) ?? 0;
      return {
        clave,
        etiqueta: etiqueta(clave),
        cantidad,
        porcentaje: total === 0 ? 0 : Math.round((cantidad / total) * 100),
      };
    })
    .filter((s) => s.cantidad > 0);
}

export function distribucionPorEdad(
  alumnos: readonly { fechaNacimiento: string | null }[],
  hoy: string,
): SegmentoDistribucion[] {
  const buckets = alumnos.map((a) => bucketDeEdad(a.fechaNacimiento, hoy));
  return distribucion(buckets, BUCKETS_EDAD, etiquetaBucketEdad);
}

type GeneroOSinDato = Genero | "SIN_DATO";

export function distribucionPorGenero(
  alumnos: readonly { genero: string | null }[],
): SegmentoDistribucion[] {
  const claves: readonly GeneroOSinDato[] = [...GENEROS, "SIN_DATO"];
  const valores: GeneroOSinDato[] = alumnos.map((a) => (esGenero(a.genero) ? a.genero : "SIN_DATO"));
  return distribucion(valores, claves, (c) => (c === "SIN_DATO" ? "Sin dato" : etiquetaGenero(c)));
}
