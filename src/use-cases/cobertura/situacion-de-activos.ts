import type { AuthContext } from "@/lib/auth/context";
import type { TxClient } from "@/use-cases/_kernel/with-tenant-tx";
import { listarAlumnosActivosParaCobertura } from "@/data/repositories/students-repo";
import { listarTramosCubiertos } from "@/data/repositories/payments-repo";
import { primerDiaDelMes, sumarMeses, ultimoDiaDelMes } from "@/domain/fechas/calendario";
import {
  situacionDeCobertura,
  type ParametrosDeCobertura,
  type SituacionDeCobertura,
  type TramoCubierto,
} from "@/domain/pagos/cobertura";

export type AlumnoActivoParaCobertura = Awaited<ReturnType<typeof listarAlumnosActivosParaCobertura>>[number];

export interface ActivoConSituacion {
  alumno: AlumnoActivoParaCobertura;
  situacion: SituacionDeCobertura;
  /** Sus tramos cubiertos en la ventana leída (ver abajo). */
  tramos: TramoCubierto[];
}

/**
 * La situación de pago de HOY de cada alumno activo. Es la única
 * implementación: la usan el Panel (quién necesita atención) y Métricas
 * (qué parte del padrón está al día). Dos pantallas con dos cuentas
 * distintas terminarían diciendo dos números distintos del mismo día.
 *
 * La situación se DERIVA con las funciones puras del dominio y los
 * parámetros del gimnasio — no hay ninguna columna `moroso`
 * (docs/REGLAS-DE-NEGOCIO.md §6).
 */
export async function situacionDeLosActivos(
  tx: TxClient,
  ctx: AuthContext,
  hoy: string,
  parametros: ParametrosDeCobertura,
): Promise<ActivoConSituacion[]> {
  const activos = await listarAlumnosActivosParaCobertura(tx, ctx);

  // La ventana va MUCHO más atrás que el mes en curso, y no es un
  // exceso: `situacionDeCobertura` necesita el último tramo cubierto para
  // poder decir "sin cobertura hace 40 días". Con una ventana de un mes,
  // alguien que pagó hasta junio no tenía ningún tramo visible y la
  // pantalla lo describía como "nunca registró un pago" — una mentira
  // sobre un alumno que sí pagó.
  //
  // El extremo derecho llega al fin de mes para incluir los tramos que se
  // derraman al mes siguiente (un 1/2 mes que arrancó el 25).
  const tramos = await listarTramosCubiertos(
    tx,
    ctx,
    { desde: primerDiaDelMes(sumarMeses(hoy, -14)), hasta: ultimoDiaDelMes(hoy) },
    activos.map((a) => a.id),
  );

  const porAlumno = new Map<string, TramoCubierto[]>();
  for (const t of tramos) {
    const lista = porAlumno.get(t.studentId);
    if (lista) lista.push({ desde: t.desde, hasta: t.hasta });
    else porAlumno.set(t.studentId, [{ desde: t.desde, hasta: t.hasta }]);
  }

  return activos.map((alumno) => {
    const suyos = porAlumno.get(alumno.id) ?? [];
    return {
      alumno,
      tramos: suyos,
      situacion: situacionDeCobertura(hoy, suyos, parametros, {
        vinculo: alumno.vinculo,
        fechaAltaOriginal: alumno.fechaAltaOriginal,
      }),
    };
  });
}
