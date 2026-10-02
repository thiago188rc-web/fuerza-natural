import { normalizarTexto, telefonoArgentino } from "@/domain/alumnos/identidad";
import { leerComoConocio, type Canal } from "@/domain/alumnos/como-conocio";
import { normalizarFecha, separarNombreCompleto } from "@/domain/importacion/analisis";
import { primerDiaDelMes, sumarDias, sumarMeses, ultimoDiaDelMes } from "@/domain/fechas/calendario";
import { emparejar, separarConComa, separarDeBase } from "./emparejar";
import type { PagoDePlanilla, PersonaDeBase } from "./planillas";

/**
 * EL PLAN DE LA MIGRACIÓN — función pura: planillas adentro, alumnos con
 * sus pagos y su historia afuera. No toca ninguna base; `migrar-planillas`
 * lo muestra (modo reporte) o lo escribe (modo aplicar).
 *
 * La historia de cada alumno se reconstruye con la MISMA cuenta que hace
 * el dueño en su planilla: "dejó" es pagar un mes y el siguiente no;
 * "volvió" es no haber pagado el mes anterior y pagar este. Así las bajas
 * y altas de cada mes en Métricas son las mismas que él ya conoce.
 */

export interface OpcionesDelPlan {
  anio: number;
  /** El último mes con el padrón completo (la hoja de septiembre). */
  mesDelPadron: string;
  /** El mes en curso, todavía abierto (octubre): pagar o no, aún no dice nada. */
  mesEnCurso: string;
  hoy: string;
  /** Plan del gimnasio por nombre ("2 días", "LIBRE"…). */
  planes: ReadonlyMap<string, { dias: number }>;
  /** Plan para quien no tiene ningún pago que lo diga. */
  planPorDefecto: string;
  /** Nombres de la planilla que se emparejan a mano: texto de la planilla → texto de la base. */
  alias?: ReadonlyMap<string, string>;
}

export interface PagoMigrado {
  clave: string;
  fecha: string;
  monto: number;
  modalidad: "MES_COMPLETO" | "MEDIO_MES";
  planNombre: string;
  tramos: { periodo: string; cubreDesde: string; cubreHasta: string }[];
  nota: string;
}

export interface EventoMigrado {
  tipo: "ALTA" | "BAJA" | "REACTIVACION";
  fecha: string;
}

export interface AlumnoMigrado {
  fuente: "BASE" | "BASE+CUOTAS" | "CUOTAS";
  apellido: string;
  nombre: string;
  documento: string | null;
  fechaNacimiento: string | null;
  direccion: string | null;
  telefono: string | null;
  comoConocio: Canal[] | null;
  fechaAltaOriginal: string;
  planNombre: string;
  planPorDefecto: boolean;
  vinculo: "ACTIVO" | "BAJA";
  vinculoDesde: string;
  bajaFecha: string | null;
  bajaObservacion: string | null;
  notas: string | null;
  pagos: PagoMigrado[];
  eventos: EventoMigrado[];
  /** Para el reporte: de dónde salió. */
  origen: string;
}

export interface PlanDeMigracion {
  alumnos: AlumnoMigrado[];
  avisos: string[];
  /** Pagos que no entran (fuera del mes de su hoja, sin fecha, monto ilegible). */
  descartados: string[];
  emparejados: { planilla: string; base: string; exacto: boolean }[];
  /** Bajas que cuenta el plan, por mes, contra las de la hoja "BAJAS" del dueño. */
  controlDeBajas: { mes: string; plan: number; planilla: number }[];
}

interface Acumulado {
  base: PersonaDeBase | null;
  nombrePlanilla: string | null;
  pagos: (PagoDePlanilla & { fecha: string; monto: number })[];
  enPadron: boolean;
  nuevoMarcadoEnEnero: boolean;
  bajaEnEnero: boolean;
}

const NOTA_IMPORTACION = "Importado del control de cuotas 2026 (la planilla no registra el método de pago).";

function montoDe(valor: string): number | null {
  // "5O000" (con la letra O) es un tipeo real de la planilla.
  const limpio = valor.replace(/[oO]/g, "0").replace(/[^\d]/g, "");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function planDeDias(dias: string, planes: OpcionesDelPlan["planes"]): string | null {
  const d = dias.trim().toUpperCase();
  if (d === "LIBRE" && planes.has("LIBRE")) return "LIBRE";
  if (/^\d$/.test(d) && planes.has(`${d} días`)) return `${d} días`;
  return null;
}

function nombreParaMostrar(completo: string, deBase: boolean): { apellido: string; nombre: string } | null {
  const conPunto = completo.replace(/\.\s/, ", ");
  const separado = separarNombreCompleto(conPunto);
  if (separado) return separado;
  // Sin coma: en la base el encabezado dice "APELLIDO Y NOMBRE".
  const partes = normalizarTexto(completo).split(" ");
  if (partes.length < 2) return null;
  return deBase
    ? { apellido: partes[0], nombre: partes.slice(1).join(" ") }
    : { apellido: partes.slice(0, -1).join(" "), nombre: partes[partes.length - 1] };
}

function nacimientoDe(p: PersonaDeBase, hoy: string): string | null {
  const { dia, mes, anio } = p.nacimiento;
  if (!/^\d{1,2}$/.test(dia) || !/^\d{1,2}$/.test(mes) || !/^\d{4}$/.test(anio)) return null;
  const iso = normalizarFecha(`${dia}/${mes}/${anio}`);
  if (!iso || iso > hoy || iso < "1900-01-01") return null;
  return iso;
}

function inicioDe(p: PersonaDeBase, hoy: string): string | null {
  const iso = p.inicio.iso ?? (p.inicio.crudo ? normalizarFecha(p.inicio.crudo) : null);
  if (!iso || iso > hoy || iso < "2000-01-01") return null;
  return iso;
}

function mesesDelAnio(anio: number, hasta: string): string[] {
  const meses: string[] = [];
  for (let m = `${anio}-01-01`; m <= hasta; m = sumarMeses(m, 1)) meses.push(m);
  return meses;
}

export function construirPlan(
  base: readonly PersonaDeBase[],
  pagosDePlanilla: readonly (PagoDePlanilla & { nuevos?: string })[],
  bajasDeLaPlanilla: ReadonlyMap<string, readonly string[]>,
  opciones: OpcionesDelPlan,
): PlanDeMigracion {
  const avisos: string[] = [];
  const descartados: string[] = [];
  const emparejados: PlanDeMigracion["emparejados"] = [];

  const acumulados: Acumulado[] = base.map((p) => ({
    base: p,
    nombrePlanilla: null,
    pagos: [],
    enPadron: false,
    nuevoMarcadoEnEnero: false,
    bajaEnEnero: false,
  }));
  const deBase = acumulados.slice();
  const porNombreSinPareja = new Map<string, Acumulado>();
  const cache = new Map<string, Acumulado | null>();

  const buscar = (nombre: string, crear = true): Acumulado | null => {
    if (cache.has(nombre)) return cache.get(nombre)!;
    if (!crear) {
      const e = emparejar(nombre, deBase, (a) => separarDeBase(a.base!.completo));
      if (e.tipo === "UNICO") return e.persona;
      const clave = separarConComa(nombre.replace(/\.\s/, ", "));
      return (clave && porNombreSinPareja.get(`${clave.apellido}|${clave.nombre}`)) || null;
    }
    const alias = opciones.alias?.get(nombre);
    let resultado: Acumulado | null = null;
    if (alias) {
      resultado = deBase.find((a) => a.base!.completo === alias) ?? null;
      if (!resultado) avisos.push(`Alias “${nombre}” → “${alias}”: no está en la base.`);
    }
    if (!resultado) {
      const e = emparejar(nombre, deBase, (a) => separarDeBase(a.base!.completo));
      if (e.tipo === "UNICO") {
        resultado = e.persona;
        emparejados.push({ planilla: nombre, base: e.persona.base!.completo, exacto: e.puntaje >= 23 });
      } else if (e.tipo === "AMBIGUO") {
        avisos.push(
          `“${nombre}” se parece a varias personas de la base (${e.candidatos
            .map((c) => c.base!.completo)
            .join(" / ")}): se carga como persona aparte para revisar.`,
        );
      }
    }
    if (!resultado) {
      const clave = separarConComa(nombre.replace(/\.\s/, ", "));
      const k = clave ? `${clave.apellido}|${clave.nombre}` : nombre;
      resultado = porNombreSinPareja.get(k) ?? null;
      if (!resultado) {
        resultado = { base: null, nombrePlanilla: nombre, pagos: [], enPadron: false, nuevoMarcadoEnEnero: false, bajaEnEnero: false };
        porNombreSinPareja.set(k, resultado);
        acumulados.push(resultado);
      }
    }
    cache.set(nombre, resultado);
    return resultado;
  };

  const primerMes = `${opciones.anio}-01-01`;

  for (const p of pagosDePlanilla) {
    // Un renglón sin fecha no es un pago ni una persona: en la planilla
    // real son notas del dueño ("PAGAN CERCA DEL 15").
    if (!p.fecha) {
      descartados.push(`${p.hoja} fila ${p.linea}: “${p.nombre}” sin fecha de pago.`);
      continue;
    }
    const persona = buscar(p.nombre);
    if (!persona) continue;
    // La hoja del mes del padrón (septiembre) ES el padrón: quien figura
    // ahí está activo aunque su renglón sea un recordatorio sin pago.
    if (p.mesDeHoja === opciones.mesDelPadron) persona.enPadron = true;
    if (p.fecha.slice(0, 7) !== p.mesDeHoja.slice(0, 7)) {
      // La hoja de octubre arrastra el listado de septiembre debajo, con
      // sus fechas de septiembre: son recordatorios, no pagos nuevos.
      descartados.push(`${p.hoja} fila ${p.linea}: “${p.nombre}” fecha ${p.fecha} fuera del mes de la hoja.`);
      continue;
    }
    const monto = montoDe(p.valor);
    if (monto === null) {
      descartados.push(`${p.hoja} fila ${p.linea}: “${p.nombre}” monto ilegible “${p.valor}”.`);
      continue;
    }
    if (p.mesDeHoja === primerMes && p.nuevos?.trim()) persona.nuevoMarcadoEnEnero = true;
    persona.pagos.push({ ...p, fecha: p.fecha, monto });
  }

  // Las bajas de enero no se pueden deducir (no hay diciembre): se toman
  // de la hoja BAJAS del dueño.
  for (const nombre of bajasDeLaPlanilla.get(primerMes) ?? []) {
    const persona = buscar(nombre, false);
    if (persona) persona.bajaEnEnero = true;
    else avisos.push(`Hoja BAJAS, enero: “${nombre}” no aparece en la base ni en los pagos.`);
  }

  const meses = mesesDelAnio(opciones.anio, opciones.mesEnCurso);
  const alumnos: AlumnoMigrado[] = [];

  for (const a of acumulados) {
    const notas: string[] = [];
    const completo = a.base?.completo ?? a.nombrePlanilla!;
    const partes = nombreParaMostrar(completo, a.base !== null);
    if (!partes) {
      avisos.push(`“${completo}”: no se puede separar nombre y apellido — no se carga.`);
      continue;
    }

    const pagos = [...a.pagos].sort((x, y) => x.fecha.localeCompare(y.fecha));
    const pagoEn = new Map<string, (typeof pagos)[number][]>();
    for (const p of pagos) pagoEn.set(p.mesDeHoja, [...(pagoEn.get(p.mesDeHoja) ?? []), p]);

    // Plan habitual: el del último pago que lo dice.
    let planNombre: string | null = null;
    for (const p of [...pagos].reverse()) {
      planNombre = planDeDias(p.dias, opciones.planes);
      if (planNombre) break;
    }
    const planPorDefecto = planNombre === null;
    if (planPorDefecto) {
      planNombre = opciones.planPorDefecto;
      notas.push(`Plan sin dato en las planillas: quedó en “${planNombre}”. Confirmalo si vuelve.`);
    }

    // Fecha de alta: la de INICIO de la base; si un pago es anterior, el pago manda.
    const inicio = a.base ? inicioDe(a.base, opciones.hoy) : null;
    if (a.base && !inicio && a.base.inicio.crudo && !/^[/\s]+$/.test(a.base.inicio.crudo)) {
      notas.push(`Fecha de inicio ilegible en la base: “${a.base.inicio.crudo}”.`);
    }
    const primerPago = pagos[0]?.fecha ?? null;
    let fechaAlta = [inicio, primerPago].filter((f): f is string => f !== null).sort()[0] ?? null;

    // ¿Está en algún mes del año? (presencia = pagó, o figura en el padrón)
    const presente = (mes: string) =>
      pagoEn.has(mes) || (mes === opciones.mesDelPadron && a.enPadron);
    // Quien empezó este mes o el anterior según la base y todavía no tiene
    // pagos es un alta reciente, no una baja: queda activo y el Panel lo
    // muestra como "nuevo sin pago" para que el dueño lo resuelva.
    const altaReciente = pagos.length === 0 && inicio !== null && inicio >= opciones.mesDelPadron;
    const activo = presente(opciones.mesDelPadron) || pagoEn.has(opciones.mesEnCurso) || altaReciente;

    const eventos: EventoMigrado[] = [];
    for (const mes of meses) {
      const cerrado = mes < opciones.mesEnCurso;
      const ahora = presente(mes);
      const antes = mes === primerMes ? ahora && !a.nuevoMarcadoEnEnero : presente(sumarMeses(mes, -1));
      const pagoDelMes = pagoEn.get(mes)?.[0]?.fecha ?? mes;

      if (mes === primerMes && a.bajaEnEnero && !ahora) {
        eventos.push({ tipo: "BAJA", fecha: mes });
        continue;
      }
      if (antes && !ahora && cerrado) eventos.push({ tipo: "BAJA", fecha: mes });
      if (!antes && ahora) {
        const esNuevo = fechaAlta !== null && fechaAlta >= mes && fechaAlta <= ultimoDiaDelMes(mes) &&
          !eventos.some((e) => e.tipo !== "ALTA");
        if (!esNuevo && fechaAlta !== null && fechaAlta < mes) {
          eventos.push({ tipo: "REACTIVACION", fecha: pagoDelMes });
        }
      }
    }

    const vinculo: "ACTIVO" | "BAJA" = activo ? "ACTIVO" : "BAJA";
    let bajaFecha: string | null = null;
    let bajaObservacion: string | null = null;

    if (fechaAlta === null) {
      // Ni INICIO ni pagos: sin ninguna fecha, cualquier valor sería inventado.
      // Va como baja anterior al control de cuotas, y lo dice.
      fechaAlta = sumarDias(primerMes, -1);
      notas.push("Sin fecha de inicio en la base ni pagos en 2026: la fecha de alta no se conoce.");
    }

    const ultimaBaja = [...eventos].reverse().find((e) => e.tipo === "BAJA");
    const ultimaReactivacion = [...eventos].reverse().find((e) => e.tipo === "REACTIVACION");

    if (vinculo === "BAJA") {
      if (ultimaBaja && (!ultimaReactivacion || ultimaBaja.fecha > ultimaReactivacion.fecha)) {
        bajaFecha = ultimaBaja.fecha;
        bajaObservacion = `Dejó de pagar en ${bajaFecha.slice(0, 7)} según el control de cuotas.`;
      } else if (fechaAlta < primerMes) {
        // En la base pero sin ningún pago en el control de 2026: se fue
        // antes de que empezara ese registro. La fecha exacta no está.
        bajaFecha = sumarDias(primerMes, -1);
        bajaObservacion = "No figura en el control de cuotas 2026: dejó antes de ese año (fecha exacta desconocida).";
      } else {
        // Empezó en 2026 según la base pero no tiene pagos ni está en el padrón.
        bajaFecha = fechaAlta;
        bajaObservacion = "Figura en la base con inicio en 2026, pero sin pagos ni en el padrón actual.";
        avisos.push(`“${completo}”: inicio ${fechaAlta} sin pagos en el control — queda de baja.`);
      }
    }

    if (vinculo === "BAJA" && bajaFecha! < fechaAlta) {
      bajaFecha = fechaAlta;
    }

    // Teléfono: argentino de 10 dígitos → +549…; lo demás no se adivina.
    let telefono: string | null = null;
    const telCrudo = a.base?.telefono ?? null;
    if (telCrudo && !/^[/\s]+$/.test(telCrudo)) {
      telefono = telefonoArgentino(telCrudo);
      if (!telefono) notas.push(`Teléfono en la base: ${telCrudo} (no tiene un formato reconocible, no se cargó).`);
    }

    const tramosDe = (p: (typeof pagos)[number]): PagoMigrado["tramos"] => {
      if (p.dias.trim().toUpperCase() !== "1/2 MES") {
        return [{ periodo: p.mesDeHoja, cubreDesde: p.mesDeHoja, cubreHasta: ultimoDiaDelMes(p.mesDeHoja) }];
      }
      const desde = p.fecha;
      const hasta = sumarDias(desde, 14);
      const finDeMes = ultimoDiaDelMes(desde);
      if (hasta <= finDeMes) return [{ periodo: primerDiaDelMes(desde), cubreDesde: desde, cubreHasta: hasta }];
      return [
        { periodo: primerDiaDelMes(desde), cubreDesde: desde, cubreHasta: finDeMes },
        { periodo: primerDiaDelMes(hasta), cubreDesde: primerDiaDelMes(hasta), cubreHasta: hasta },
      ];
    };

    const pagosMigrados: PagoMigrado[] = pagos.map((p) => {
      const medio = p.dias.trim().toUpperCase() === "1/2 MES";
      return {
        clave: `migracion-${opciones.anio}:${p.hoja}:${p.linea}`,
        fecha: p.fecha,
        monto: p.monto,
        modalidad: medio ? "MEDIO_MES" : "MES_COMPLETO",
        planNombre: planDeDias(p.dias, opciones.planes) ?? planNombre!,
        tramos: tramosDe(p),
        nota: medio
          ? `${NOTA_IMPORTACION} 1/2 MES: la cobertura se toma desde la fecha de pago.`
          : NOTA_IMPORTACION,
      };
    });

    if (fechaAlta > opciones.hoy) fechaAlta = opciones.hoy;
    eventos.unshift({ tipo: "ALTA", fecha: fechaAlta });

    const nacimiento = a.base ? nacimientoDe(a.base, opciones.hoy) : null;
    const notasTexto = notas.join(" ").slice(0, 1000) || null;

    alumnos.push({
      fuente: a.base ? (pagos.length > 0 ? "BASE+CUOTAS" : "BASE") : "CUOTAS",
      apellido: partes.apellido.slice(0, 80),
      nombre: partes.nombre.slice(0, 80),
      documento: a.base?.dni?.replace(/\D/g, "") || null,
      fechaNacimiento: nacimiento,
      direccion: a.base?.direccion && !/^[/\s]+$/.test(a.base.direccion) ? a.base.direccion.slice(0, 200) : null,
      telefono,
      comoConocio: a.base ? leerComoConocio(a.base.comoConocio) : null,
      fechaAltaOriginal: fechaAlta,
      planNombre: planNombre!,
      planPorDefecto,
      vinculo,
      vinculoDesde:
        vinculo === "BAJA" ? bajaFecha! : (ultimaReactivacion?.fecha ?? fechaAlta),
      bajaFecha,
      bajaObservacion,
      notas: notasTexto,
      pagos: pagosMigrados,
      eventos,
      origen: a.base ? `${a.base.hoja} fila ${a.base.linea}` : `cuotas: ${a.nombrePlanilla}`,
    });
  }

  // Control: las bajas por mes del plan contra la hoja BAJAS del dueño.
  const controlDeBajas = meses
    .filter((m) => m < opciones.mesEnCurso)
    .map((mes) => ({
      mes,
      plan: alumnos.filter((x) => x.eventos.some((e) => e.tipo === "BAJA" && e.fecha === mes)).length,
      planilla: bajasDeLaPlanilla.get(mes)?.length ?? 0,
    }));

  return { alumnos, avisos, descartados, emparejados, controlDeBajas };
}
