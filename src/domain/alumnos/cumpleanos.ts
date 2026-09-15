/**
 * Cumpleaños del mes — pura, sin I/O. Compara solo mes y día (nunca el
 * año) contra `fechaNacimiento`, así que funciona igual para alguien
 * nacido en cualquier año.
 */

export interface AlumnoConCumpleanos {
  id: string;
  nombre: string;
  apellido: string;
  /** 'MM-DD', para ordenar sin construir una fecha que puede no existir este año (29 de febrero). */
  diaMes: string;
  dia: number;
  esHoy: boolean;
}

export function cumpleanosDelMes(
  alumnos: readonly { id: string; nombre: string; apellido: string; fechaNacimiento: string | null }[],
  hoy: string,
): AlumnoConCumpleanos[] {
  const mesDeHoy = hoy.slice(5, 7);
  const diaMesDeHoy = hoy.slice(5, 10);

  return alumnos
    .filter((a) => a.fechaNacimiento !== null && a.fechaNacimiento.slice(5, 7) === mesDeHoy)
    .map((a) => {
      const diaMes = a.fechaNacimiento!.slice(5, 10);
      return {
        id: a.id,
        nombre: a.nombre,
        apellido: a.apellido,
        diaMes,
        dia: Number(diaMes.slice(3, 5)),
        esHoy: diaMes === diaMesDeHoy,
      };
    })
    .sort((a, b) => a.diaMes.localeCompare(b.diaMes));
}
