/**
 * CUÁNTOS ALUMNOS ESTABAN ACTIVOS a fin de cada mes — una reconstrucción
 * histórica a partir de dos fechas que sí se guardan por alumno
 * (`fechaAltaOriginal`, `bajaFecha`), no un conteo aparte.
 *
 * Es DELIBERADAMENTE distinto de contar `vinculo = 'ACTIVO'` hoy: esa
 * columna solo describe el presente. Para saber si alguien estaba activo
 * el 30 de junio, lo único que se puede afirmar con lo que hay es "ya
 * había entrado (`fechaAltaOriginal <= fin de mes`) y todavía no se había
 * ido (`bajaFecha` es null o es posterior)". No usa `student_events`
 * porque ese historial recién empieza a existir cuando el sistema entró en
 * uso real — estas dos columnas, en cambio, se completaron con la fecha
 * real de alta de cada alumno al importarlo.
 */

export interface FechasDeVinculo {
  fechaAltaOriginal: string;
  bajaFecha: string | null;
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

export function activosAlFinDeCadaMes(
  alumnos: readonly FechasDeVinculo[],
  finesDeMes: readonly string[],
): ActivosDelMes[] {
  const altaMasVieja = alumnos.reduce<string | null>(
    (min, a) => (min === null || a.fechaAltaOriginal < min ? a.fechaAltaOriginal : min),
    null,
  );

  return finesDeMes.map((finDeMes) => {
    const cantidad = alumnos.filter(
      (a) =>
        a.fechaAltaOriginal <= finDeMes && (a.bajaFecha === null || a.bajaFecha > finDeMes),
    ).length;

    return {
      mes: finDeMes,
      cantidad,
      real: altaMasVieja !== null && finDeMes >= altaMasVieja,
    };
  });
}
