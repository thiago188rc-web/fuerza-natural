import { primerDiaDelMes } from "@/domain/fechas/calendario";

/**
 * CUÁNTOS ALUMNOS ESTABAN ACTIVOS a fin de cada mes — una reconstrucción
 * histórica a partir de dos fechas que sí se guardan por alumno
 * (`fechaAltaOriginal`, `bajaFecha`), no un conteo aparte.
 *
 * Es DELIBERADAMENTE distinto de contar `vinculo = 'ACTIVO'` hoy: esa
 * columna solo describe el presente. Para saber si alguien estaba activo
 * el 30 de junio, lo único que se puede afirmar con lo que hay es "ya
 * había entrado (`fechaAltaOriginal <= fin de mes`) y todavía no se había
 * ido (`bajaFecha` es null o es posterior)".
 *
 * Con una salvedad que cambia el número: alguien que se fue y VOLVIÓ ya
 * no tiene `bajaFecha` (reactivar la limpia), así que con esas dos
 * columnas solas se lo contaría activo también en los meses en que no
 * venía. Por eso, cuando el alumno tiene cambios de vínculo registrados
 * (BAJA / REACTIVACION en `student_events`), mandan esos hechos; las dos
 * columnas quedan para quien no tiene ninguno (un alumno importado que
 * nunca cambió de estado).
 */

export interface CambioDeVinculo {
  tipo: "BAJA" | "REACTIVACION";
  /** 'YYYY-MM-DD' — desde ese día rige el cambio. */
  fecha: string;
}

export interface FechasDeVinculo {
  fechaAltaOriginal: string;
  bajaFecha: string | null;
  /** Sus BAJA/REACTIVACION, en cualquier orden. Vacío o ausente: no cambió nunca de estado. */
  cambios?: readonly CambioDeVinculo[];
}

/** ¿Estaba activo (o pausado: no se había ido) al cierre de ese día? */
export function estabaActivo(alumno: FechasDeVinculo, dia: string): boolean {
  if (alumno.fechaAltaOriginal > dia) return false;
  const cambios = [...(alumno.cambios ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (cambios.length === 0) return alumno.bajaFecha === null || alumno.bajaFecha > dia;

  const hastaEseDia = cambios.filter((c) => c.fecha <= dia);
  if (hastaEseDia.length > 0) return hastaEseDia[hastaEseDia.length - 1].tipo === "REACTIVACION";
  // Ningún cambio todavía: si el primero que viene es una vuelta, es que
  // antes de eso no estaba (se había ido sin que quedara registrado cuándo).
  return cambios[0].tipo === "BAJA";
}

export interface ActivosDelMes {
  mes: string;
  cantidad: number;
  /**
   * `false` cuando `finDeMes` es anterior al dato de alta más viejo que
   * tiene el sistema: no es que hubiera cero alumnos ese mes, es que
   * ningún registro llega tan atrás. Mostrar un 0 ahí sería mentir.
   */
  real: boolean;
}

/**
 * A partir de qué mes el historial es "dato real" y no un hueco sin
 * cargar: ni antes de la alta más vieja que tiene el sistema, ni antes
 * del mes del primer pago registrado (si el padrón se cargó con altas
 * viejas pero el gimnasio recién cobra por acá desde más tarde). Usado
 * por todos los gráficos de historial de Métricas — se extrae acá para
 * que la ventana "navegable" de un gráfico pueda calcularlo sin repetir
 * la cuenta completa de `metricasQuery`.
 */
export function inicioDelHistorialReal(
  alumnos: readonly FechasDeVinculo[],
  primerPago: string | null,
): string | null {
  const altaMasVieja = alumnos.reduce<string | null>(
    (min, a) => (min === null || a.fechaAltaOriginal < min ? a.fechaAltaOriginal : min),
    null,
  );
  if (altaMasVieja === null) return null;
  if (primerPago !== null) {
    const mesDelPrimerPago = primerDiaDelMes(primerPago);
    if (mesDelPrimerPago > altaMasVieja) return mesDelPrimerPago;
  }
  return altaMasVieja;
}

export function activosAlFinDeCadaMes(
  alumnos: readonly FechasDeVinculo[],
  finesDeMes: readonly string[],
): ActivosDelMes[] {
  const altaMasVieja = alumnos.reduce<string | null>(
    (min, a) => (min === null || a.fechaAltaOriginal < min ? a.fechaAltaOriginal : min),
    null,
  );

  return finesDeMes.map((finDeMes) => {
    const cantidad = alumnos.filter((a) => estabaActivo(a, finDeMes)).length;

    return {
      mes: finDeMes,
      cantidad,
      real: altaMasVieja !== null && finDeMes >= altaMasVieja,
    };
  });
}
