import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import {
  activityLog,
  appUsers,
  attendance,
  gyms,
  payments,
  paymentPeriods,
  plans,
  students,
  studentEvents,
} from "@/data/schema";
import { hoyISO } from "@/domain/fechas/hoy";
import {
  claveDeMes,
  primerDiaDelMes,
  sumarDias,
  sumarMeses,
  ultimoDiaDelMes,
} from "@/domain/fechas/calendario";
import { coberturaDe, tramosImputados, type Modalidad } from "@/domain/pagos/modalidad";

if (existsSync(resolve(process.cwd(), ".env.local"))) {
  loadEnv({ path: resolve(process.cwd(), ".env.local"), override: false, quiet: true });
}

/**
 * PADRÓN DE DEMOSTRACIÓN.
 *
 * Nombres inventados, historia inventada. NUNCA los 207 alumnos ni los 778
 * pagos reales de Fuerza Natural: esos entran por la fase de migración,
 * con su propio proceso de identidad y conflictos.
 *
 * Lo que sí es real es el CAMINO: estos datos entran por las mismas tablas,
 * con los mismos CHECK, los mismos tramos de `payment_periods` y la misma
 * aritmética de cobertura (`coberturaDe` / `tramosImputados`) que usa el
 * caso de uso de cobro. Nada acá "dibuja" un estado: la situación de cada
 * alumno se deriva después, en la app, de estos pagos.
 *
 * Determinista: el generador pseudoaleatorio tiene semilla fija, así que
 * dos corridas producen exactamente el mismo padrón. Un dataset de demo
 * que cambia en cada corrida hace imposible saber si algo se rompió.
 *
 *   npm run db:seed:demo            → crea el padrón si no existe
 *   npm run db:seed:demo -- --reset → lo borra y lo vuelve a crear
 */

const AUTH_USER_ID_DEMO = "00000000-0000-0000-0000-000000000001";

/** PRNG con semilla (mulberry32). Determinismo sin dependencias. */
function generador(semilla: number) {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const azar = generador(20260907);
const elegir = <T,>(lista: readonly T[]): T => lista[Math.floor(azar() * lista.length)];
const entre = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1));

const NOMBRES = [
  "Agustina", "Bruno", "Camila", "Diego", "Eliana", "Facundo", "Gabriela", "Hernán",
  "Ivana", "Joaquín", "Karina", "Leandro", "Malena", "Nicolás", "Ornella", "Pablo",
  "Rocío", "Santiago", "Tamara", "Ulises", "Valentina", "Walter", "Ximena", "Yamil",
  "Zoe", "Ariel", "Belén", "Cristian", "Dana", "Emiliano", "Florencia", "Gonzalo",
  "Julieta", "Matías", "Natalia", "Ramiro", "Sofía", "Tomás", "Victoria", "Lucas",
  "Micaela", "Federico", "Antonella", "Marcos", "Paula", "Sebastián",
];

const APELLIDOS = [
  "Álvarez", "Benítez", "Cabrera", "Domínguez", "Escobar", "Ferreyra", "Gutiérrez",
  "Herrera", "Ibáñez", "Juárez", "Kraus", "Ledesma", "Molina", "Navarro", "Ojeda",
  "Peralta", "Quiroga", "Ríos", "Sosa", "Tejada", "Urbina", "Vega", "Zárate",
  "Acosta", "Barrios", "Castro", "Delgado", "Figueroa", "Godoy", "Maldonado",
  "Núñez", "Paz", "Ramírez", "Silva", "Torres", "Villalba", "Aguirre", "Bianchi",
  "Cardozo", "Duarte", "Fernández", "Gómez", "Luna", "Medina", "Ponce", "Suárez",
];

/**
 * Precios HISTÓRICOS. Existen para que la demo muestre lo que la regla
 * exige: un pago conserva el importe con el que se cobró, y subir un
 * precio hoy no reescribe la historia (docs/REGLAS-DE-NEGOCIO.md §2).
 * Los de septiembre 2026 son los confirmados por el dueño.
 */
const PRECIOS_POR_MES: { desde: string; precios: Record<number, number> }[] = [
  { desde: "2026-07-01", precios: { 2: 50000, 3: 55000, 4: 60000, 5: 65000 } },
  { desde: "2026-04-01", precios: { 2: 44000, 3: 48000, 4: 52000, 5: 57000 } },
  { desde: "2025-01-01", precios: { 2: 32000, 3: 35000, 4: 38000, 5: 42000 } },
];

function precioHistorico(mes: string, diasSemana: number): number {
  const tabla = PRECIOS_POR_MES.find((p) => mes >= p.desde) ?? PRECIOS_POR_MES.at(-1)!;
  return tabla.precios[diasSemana] ?? tabla.precios[5];
}

/** El 1/2 mes también tuvo su historia de precios. */
function precioMedioMesHistorico(mes: string): number {
  return mes >= "2026-07-01" ? 45000 : mes >= "2026-04-01" ? 39000 : 29000;
}

const METODOS = ["EFECTIVO", "EFECTIVO", "EFECTIVO", "TRANSFERENCIA", "BILLETERA"] as const;

const MOTIVOS_BAJA = [
  { codigo: "ECONOMICO", etiqueta: "Económico" },
  { codigo: "FALTA_TIEMPO", etiqueta: "Falta de tiempo" },
  { codigo: "HORARIOS", etiqueta: "Horarios" },
  { codigo: "MUDANZA", etiqueta: "Mudanza / distancia" },
  { codigo: "DEJO_DE_ASISTIR", etiqueta: "Dejó de asistir" },
];

/**
 * El perfil de pago de cada alumno. Es lo que hace que el padrón se vea
 * como un gimnasio real y no como una tabla generada: la mayoría paga, un
 * puñado se atrasa, y siempre hay dos o tres que hace meses no aparecen.
 */
type Perfil = "AL_DIA" | "PAGA_TARDE" | "ATRASADO" | "ABANDONO" | "NUEVO" | "MEDIO_MES";

const REPARTO_DE_PERFILES: Perfil[] = [
  ...Array<Perfil>(20).fill("AL_DIA"),
  ...Array<Perfil>(7).fill("PAGA_TARDE"),
  ...Array<Perfil>(4).fill("ATRASADO"),
  ...Array<Perfil>(2).fill("ABANDONO"),
  ...Array<Perfil>(3).fill("NUEVO"),
  ...Array<Perfil>(3).fill("MEDIO_MES"),
];

interface AlumnoDemo {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  genero: string | null;
  vinculo: "ACTIVO" | "PAUSADO" | "BAJA";
  planIdx: number;
  fechaAlta: string;
  vinculoDesde: string;
  perfil: Perfil;
  pausaHasta?: string;
  pausaNota?: string;
  bajaFecha?: string;
  bajaMotivo?: { codigo: string; etiqueta: string };
  bajaObservacion?: string | null;
}

async function main() {
  const reset = process.argv.includes("--reset");
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) {
    console.error("Falta DATABASE_URL_OWNER — no se puede seedear sin una conexión con privilegios.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const [demo] = await db
    .select({
      id: appUsers.id,
      gymId: appUsers.gymId,
      email: appUsers.email,
      rol: appUsers.rol,
    })
    .from(appUsers)
    .where(eq(appUsers.authUserId, AUTH_USER_ID_DEMO));

  if (!demo) {
    console.error("No existe el usuario DEMO. Corré primero: npm run db:seed");
    process.exit(1);
  }

  const { id: usuarioId, gymId, email: usuarioEmail, rol: usuarioRol } = demo;

  await db.transaction(async (tx) => {
    // El contexto de tenant va PRIMERO: `gyms`, `plans` y `students` tienen
    // FORCE ROW LEVEL SECURITY, así que sin esto las lecturas de abajo
    // devuelven cero filas incluso con la conexión de owner.
    await tx.execute(sql`select set_config('app.gym_id', ${gymId}, true)`);

    const [gym] = await tx
      .select({ timezone: gyms.timezone })
      .from(gyms)
      .where(eq(gyms.id, gymId));
    const hoy = hoyISO(gym?.timezone ?? "America/Argentina/Buenos_Aires");

    const catalogo = await tx
      .select({
        id: plans.id,
        nombre: plans.nombre,
        diasSemana: plans.diasSemana,
        acceso: plans.acceso,
      })
      .from(plans)
      .where(eq(plans.gymId, gymId))
      .orderBy(plans.orden);

    if (catalogo.length === 0) {
      throw new Error("El gimnasio no tiene planes. Corré primero: npm run db:seed");
    }

    const [{ total }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(students)
      .where(eq(students.gymId, gymId));

    if (total > 0 && !reset) {
      console.log(`El gimnasio ya tiene ${total} alumnos. Nada que hacer.`);
      console.log("Para regenerar el padrón de demo: npm run db:seed:demo -- --reset");
      return;
    }

    if (total > 0) {
      // Solo con la conexión de owner y solo en desarrollo. La app jamás
      // borra alumnos: `fn_app` ni siquiera tiene el privilegio DELETE.
      await tx.delete(paymentPeriods).where(eq(paymentPeriods.gymId, gymId));
      await tx.delete(payments).where(eq(payments.gymId, gymId));
      await tx.delete(studentEvents).where(eq(studentEvents.gymId, gymId));
      await tx.delete(students).where(eq(students.gymId, gymId));
      console.log(`Padrón anterior borrado (${total} alumnos).`);
    }

    // ---------------------------------------------------------------
    // 1. Las personas
    // ---------------------------------------------------------------
    const usados = new Set<string>();
    const alumnos: AlumnoDemo[] = [];

    const CANTIDAD_ACTIVOS = REPARTO_DE_PERFILES.length; // 39
    const CANTIDAD_PAUSADOS = 3;
    const CANTIDAD_BAJAS = 6;

    function personaNueva(): { nombre: string; apellido: string } {
      for (let intento = 0; intento < 200; intento++) {
        const nombre = elegir(NOMBRES);
        const apellido = elegir(APELLIDOS);
        const clave = `${nombre} ${apellido}`;
        if (!usados.has(clave)) {
          usados.add(clave);
          return { nombre, apellido };
        }
      }
      throw new Error("No se pudo generar un nombre único.");
    }

    /** Teléfono ficticio en E.164, que es lo que exige el CHECK de la base. */
    function telefonoFicticio(): string | null {
      // Uno de cada seis alumnos sin teléfono: el Data Discovery mostró
      // que en un padrón real siempre faltan, y la app tiene que
      // aguantarlo sin inventar un número.
      if (azar() < 0.17) return null;
      return `+5491${entre(10, 99)}${String(entre(100000, 999999)).padStart(6, "0")}`;
    }

    /** Género ficticio — campo opcional, no todos lo completan. */
    function generoFicticio(): string | null {
      if (azar() < 0.2) return null;
      const r = azar();
      if (r < 0.48) return "FEMENINO";
      if (r < 0.94) return "MASCULINO";
      if (r < 0.98) return "OTRO";
      return "PREFIERO_NO_DECIR";
    }

    for (let i = 0; i < CANTIDAD_ACTIVOS; i++) {
      const perfil = REPARTO_DE_PERFILES[i];
      const { nombre, apellido } = personaNueva();
      const fechaAlta =
        perfil === "NUEVO"
          ? sumarDias(hoy, -entre(1, 22))
          : sumarDias(hoy, -entre(70, 780));

      alumnos.push({
        id: randomUUID(),
        nombre,
        apellido,
        telefono: telefonoFicticio(),
        genero: generoFicticio(),
        vinculo: "ACTIVO",
        planIdx: entre(0, catalogo.length - 1),
        fechaAlta,
        vinculoDesde: fechaAlta,
        perfil,
      });
    }

    for (let i = 0; i < CANTIDAD_PAUSADOS; i++) {
      const { nombre, apellido } = personaNueva();
      const fechaAlta = sumarDias(hoy, -entre(200, 700));
      const desde = sumarDias(hoy, -entre(8, 40));
      alumnos.push({
        id: randomUUID(),
        nombre,
        apellido,
        telefono: telefonoFicticio(),
        genero: generoFicticio(),
        vinculo: "PAUSADO",
        planIdx: entre(0, catalogo.length - 1),
        fechaAlta,
        vinculoDesde: desde,
        pausaHasta: sumarDias(desde, entre(30, 75)),
        pausaNota: elegir([
          "Lesión de rodilla, vuelve con el alta del kinesiólogo",
          "Viaje de trabajo",
          "Se toma el mes por estudio",
        ]),
        perfil: "AL_DIA",
      });
    }

    for (let i = 0; i < CANTIDAD_BAJAS; i++) {
      const { nombre, apellido } = personaNueva();
      const fechaAlta = sumarDias(hoy, -entre(300, 900));
      const bajaFecha = sumarDias(hoy, -entre(3, 150));
      const motivo = elegir(MOTIVOS_BAJA);
      alumnos.push({
        id: randomUUID(),
        nombre,
        apellido,
        telefono: telefonoFicticio(),
        genero: generoFicticio(),
        vinculo: "BAJA",
        planIdx: entre(0, catalogo.length - 1),
        fechaAlta,
        vinculoDesde: bajaFecha,
        bajaFecha,
        bajaMotivo: motivo,
        bajaObservacion:
          azar() < 0.4
            ? elegir([
                "Avisó por WhatsApp que no sigue este año",
                "Se muda a otra ciudad por trabajo",
                "Dijo que vuelve más adelante",
              ])
            : null,
        perfil: "ABANDONO",
      });
    }

    await tx.insert(students).values(
      alumnos.map((a) => ({
        id: a.id,
        gymId,
        nombre: a.nombre,
        apellido: a.apellido,
        telefono: a.telefono,
        genero: a.genero,
        planId: catalogo[a.planIdx].id,
        vinculo: a.vinculo,
        fechaAltaOriginal: a.fechaAlta,
        vinculoDesde: a.vinculoDesde,
        pausaHasta: a.pausaHasta ?? null,
        pausaNota: a.pausaNota ?? null,
        bajaFecha: a.bajaFecha ?? null,
        bajaMotivoCodigo: a.bajaMotivo?.codigo ?? null,
        bajaMotivoEtiqueta: a.bajaMotivo?.etiqueta ?? null,
        bajaObservacion: a.bajaObservacion ?? null,
        origen: "MANUAL" as const,
      })),
    );

    // ---------------------------------------------------------------
    // 2. Los hechos de negocio (lo que se ve en la línea de actividad)
    // ---------------------------------------------------------------
    const eventos: {
      gymId: string;
      studentId: string;
      tipo: string;
      ocurridoEl: string;
      datos: Record<string, unknown>;
      creadoPor: string;
    }[] = [];

    for (const a of alumnos) {
      eventos.push({
        gymId,
        studentId: a.id,
        tipo: "ALTA",
        ocurridoEl: a.fechaAlta,
        datos: { planId: catalogo[a.planIdx].id },
        creadoPor: usuarioId,
      });

      if (a.vinculo === "PAUSADO") {
        eventos.push({
          gymId,
          studentId: a.id,
          tipo: "PAUSA",
          ocurridoEl: a.vinculoDesde,
          datos: { pausaHasta: a.pausaHasta, nota: a.pausaNota },
          creadoPor: usuarioId,
        });
      }

      if (a.vinculo === "BAJA") {
        eventos.push({
          gymId,
          studentId: a.id,
          tipo: "BAJA",
          ocurridoEl: a.bajaFecha!,
          datos: {
            motivoEtiqueta: a.bajaMotivo!.etiqueta,
            observacion: a.bajaObservacion ?? undefined,
          },
          creadoPor: usuarioId,
        });
      }
    }

    // Dos personas que volvieron este mes: es lo que le da vida al bloque
    // "Movimiento" del panel, y es un caso real (alguien que se fue y
    // vuelve NO es un alta nueva — conserva su fecha de alta original).
    for (const a of alumnos.filter((x) => x.vinculo === "ACTIVO" && x.perfil === "AL_DIA").slice(0, 2)) {
      eventos.push({
        gymId,
        studentId: a.id,
        tipo: "REACTIVACION",
        ocurridoEl: sumarDias(hoy, -entre(1, 7)),
        datos: {},
        creadoPor: usuarioId,
      });
    }

    await tx.insert(studentEvents).values(eventos);

    // ---------------------------------------------------------------
    // 3. Los pagos, mes por mes
    // ---------------------------------------------------------------
    const mesActual = primerDiaDelMes(hoy);
    const filasPago: (typeof payments.$inferInsert)[] = [];
    const filasPeriodo: (typeof paymentPeriods.$inferInsert)[] = [];
    /** Qué período cubre cada pago. La fecha de cobro NO alcanza: un mes
     *  completo se paga el 7 y cubre desde el 1. */
    const coberturaDePago = new Map<string, { desde: string; hasta: string }>();

    /** Registra un pago con sus tramos, igual que el caso de uso real. */
    function cobrar(opciones: {
      alumno: AlumnoDemo;
      modalidad: Modalidad;
      cubreDesde: string;
      fechaPago: string;
      monto: number;
    }) {
      const { alumno, modalidad, cubreDesde, fechaPago, monto } = opciones;
      if (fechaPago > hoy) return;

      const plan = catalogo[alumno.planIdx];
      const paymentId = randomUUID();

      filasPago.push({
        id: paymentId,
        gymId,
        studentId: alumno.id,
        fechaPago,
        planId: plan.id,
        planDiasSnapshot: plan.diasSemana,
        planNombreSnapshot: plan.nombre,
        modalidad,
        monto: monto.toFixed(2),
        metodo: elegir(METODOS),
        nota: null,
        registradoPor: usuarioId,
        idempotencyKey: null,
      });

      const cobertura = coberturaDe(modalidad, cubreDesde);
      coberturaDePago.set(paymentId, cobertura);

      // Los mismos tramos que produce el dominio en producción: un medio
      // mes que cruza el fin de mes genera una fila por cada mes tocado.
      for (const tramo of tramosImputados(cobertura)) {
        filasPeriodo.push({
          gymId,
          paymentId,
          studentId: alumno.id,
          periodo: tramo.periodo,
          cubreDesde: tramo.cubreDesde,
          cubreHasta: tramo.cubreHasta,
        });
      }
    }

    /** Hasta qué mes (inclusive) llega la cobertura de cada perfil. */
    function ultimoMesCubierto(perfil: Perfil): string | null {
      switch (perfil) {
        case "AL_DIA":
          return mesActual;
        case "MEDIO_MES":
          return mesActual;
        case "PAGA_TARDE":
          // Cubrió hasta el mes pasado; todavía no pagó el corriente. La
          // ventana de pago lo deja en "para revisar", no en descubierto.
          return primerDiaDelMes(sumarMeses(mesActual, -1));
        case "ATRASADO":
          return primerDiaDelMes(sumarMeses(mesActual, -entre(2, 3)));
        case "ABANDONO":
          return primerDiaDelMes(sumarMeses(mesActual, -entre(4, 7)));
        case "NUEVO":
          return null;
      }
    }

    for (const alumno of alumnos) {
      const plan = catalogo[alumno.planIdx];
      // LIBRE no tiene precio confirmado (queda NULL en `plans`). Para la
      // historia de la demo se cobra como 5 días, que es lo que pasaba
      // antes de que fuera una modalidad aparte. Esto NO decide el precio
      // pendiente: `plans.precio_actual` de LIBRE sigue en NULL y la app
      // lo sigue pidiendo a mano.
      const diasParaPrecio = plan.acceso === "LIBRE" ? 5 : plan.diasSemana;

      const propuesto = ultimoMesCubierto(alumno.perfil);
      if (!propuesto) continue;

      // Un alumno que entró hace dos meses no puede tener el perfil
      // "abandonó hace seis": sin este ajuste, el bucle de abajo no corre
      // ni una vez y la persona queda sin un solo pago, lo que en pantalla
      // se lee como "nunca registró un pago" para media lista.
      const mesDelAlta = primerDiaDelMes(alumno.fechaAlta);
      const hasta = propuesto < mesDelAlta ? mesDelAlta : propuesto;

      // Arranca en el mes del alta, o 10 meses atrás si el alta es vieja
      // (no hace falta una historia infinita para que la demo se vea real).
      const inicio =
        alumno.fechaAlta > sumarMeses(hasta, -10)
          ? primerDiaDelMes(alumno.fechaAlta)
          : primerDiaDelMes(sumarMeses(hasta, -10));

      for (let mes = inicio; mes <= hasta; mes = primerDiaDelMes(sumarMeses(mes, 1))) {
        // Un mes salteado de vez en cuando: pasa en un gimnasio real, y es
        // lo que hace que el historial no se vea generado.
        if (mes !== hasta && azar() < 0.08) continue;

        const esMedioMes = alumno.perfil === "MEDIO_MES" && mes === hasta;

        if (esMedioMes) {
          // Arranca cualquier día, no el 1 ni el 15: es exactamente lo que
          // el dueño confirmó y lo que ningún modelo de "mes calendario"
          // puede representar.
          const dia = entre(3, 26);
          const desde = `${claveDeMes(mes)}-${String(dia).padStart(2, "0")}`;
          cobrar({
            alumno,
            modalidad: "MEDIO_MES",
            cubreDesde: desde,
            fechaPago: desde,
            monto: precioMedioMesHistorico(mes),
          });
          continue;
        }

        const diaDePago = alumno.perfil === "PAGA_TARDE" ? entre(9, 18) : entre(1, 9);
        const tope = Number(ultimoDiaDelMes(mes).slice(8, 10));
        const fechaPago = `${claveDeMes(mes)}-${String(Math.min(diaDePago, tope)).padStart(2, "0")}`;

        cobrar({
          alumno,
          modalidad: "MES_COMPLETO",
          cubreDesde: mes,
          fechaPago,
          monto: precioHistorico(mes, diasParaPrecio),
        });
      }
    }

    // Un caso que tiene que existir en la demo porque es el que rompe
    // cualquier modelo de "mes calendario": un 1/2 mes comprado a fin del
    // mes pasado que todavía está cubriendo hoy.
    const puente = alumnos.find((a) => a.vinculo === "ACTIVO" && a.perfil === "PAGA_TARDE");
    if (puente) {
      // Once días atrás: arranca en el mes pasado, termina en éste. Genera
      // DOS filas en `payment_periods` (una por mes imputado) y hoy sigue
      // cubriendo. Es el caso que hace falta ver para entender por qué el
      // modelo no puede ser "un pago = un mes".
      const desde = sumarDias(hoy, -11);
      cobrar({
        alumno: puente,
        modalidad: "MEDIO_MES",
        cubreDesde: desde,
        fechaPago: desde,
        monto: precioMedioMesHistorico(primerDiaDelMes(desde)),
      });
    }

    await tx.insert(payments).values(filasPago);
    await tx.insert(paymentPeriods).values(filasPeriodo);

    // ---------------------------------------------------------------
    // 4. Asistencia de los últimos 30 días (solo activos)
    // ---------------------------------------------------------------
    // La probabilidad de venir un día cualquiera sale de los días por
    // semana del plan — no es una regla de negocio, es solo lo que hace
    // que la demo de Métricas se vea como un gimnasio real y no como un
    // volcado al azar.
    const DIAS_DE_ASISTENCIA = 30;
    const filasAsistencia: (typeof attendance.$inferInsert)[] = [];
    for (const alumno of alumnos) {
      if (alumno.vinculo !== "ACTIVO") continue;
      const plan = catalogo[alumno.planIdx];
      const diasEsperados = plan.acceso === "LIBRE" ? 5 : plan.diasSemana;
      const probabilidad = Math.min(0.95, diasEsperados / 6);

      for (let d = 0; d < DIAS_DE_ASISTENCIA; d++) {
        const fecha = sumarDias(hoy, -d);
        if (fecha < alumno.fechaAlta) continue;
        if (azar() < probabilidad) {
          filasAsistencia.push({ gymId, studentId: alumno.id, fecha, registradoPor: usuarioId });
        }
      }
    }
    if (filasAsistencia.length > 0) {
      await tx.insert(attendance).values(filasAsistencia).onConflictDoNothing();
    }

    // ---------------------------------------------------------------
    // 5. El registro de actividad
    // ---------------------------------------------------------------
    // Sin esto la pantalla de Actividad de la demo sale vacía, aunque
    // detrás haya un año de historia: `activity_log` es append-only y
    // nadie lo escribió por estos alumnos. Se escribe acá con el MISMO
    // formato de `resumen` que producen los casos de uso reales
    // (src/use-cases/**), para que la pantalla no tenga un modo "demo".
    //
    // OJO: esta tabla no se puede limpiar. No hay GRANT de DELETE, no hay
    // policy de DELETE y hay un trigger que aborta el intento — a propósito
    // (SPEC V1 §3.6). Un `--reset` deja las líneas viejas donde estaban;
    // para arrancar de cero hay que rehacer el esquema.
    const nombreDe = (a: AlumnoDemo) => `${a.nombre} ${a.apellido}`;
    const alumnoPorId = new Map(alumnos.map((a) => [a.id, a]));

    const filasActividad: (typeof activityLog.$inferInsert)[] = [];
    const anotar = (
      accion: string,
      entidad: string,
      entidadId: string,
      resumen: string,
      diaISO: string,
      minutoDelDia: number,
    ) =>
      filasActividad.push({
        gymId,
        actorUserId: usuarioId,
        actorEmailSnapshot: usuarioEmail,
        actorRolSnapshot: usuarioRol,
        accion,
        entidad,
        entidadId,
        resumen,
        // La hora importa: la pantalla agrupa por día y ordena por
        // instante. Todo a medianoche se leería como un volcado.
        ocurridoEn: new Date(`${diaISO}T${String(9 + Math.floor(minutoDelDia / 60)).padStart(2, "0")}:${String(minutoDelDia % 60).padStart(2, "0")}:00-03:00`),
      });

    for (const evento of eventos) {
      const alumno = alumnoPorId.get(evento.studentId as string);
      if (!alumno) continue;
      const nombre = nombreDe(alumno);
      if (evento.tipo === "ALTA") {
        anotar("student.created", "student", alumno.id, `Alta creada: ${nombre}`, evento.ocurridoEl as string, entre(0, 480));
        continue;
      }
      const resumen =
        evento.tipo === "BAJA"
          ? `${nombre} — Estado: Activo → Baja. Baja registrada — ${alumno.bajaMotivo!.etiqueta}.`
          : evento.tipo === "PAUSA"
            ? `${nombre} — Estado: Activo → Pausado. Pausado.`
            : `${nombre} — Estado: Baja → Activo. Reactivado.`;
      anotar("student.status_changed", "student", alumno.id, resumen, evento.ocurridoEl as string, entre(0, 480));
    }

    for (const pago of filasPago) {
      const alumno = alumnoPorId.get(pago.studentId as string);
      if (!alumno) continue;
      const cobertura = coberturaDePago.get(pago.id as string);
      if (!cobertura) continue;
      const etiqueta = pago.modalidad === "MEDIO_MES" ? "1/2 mes" : "Mes completo";
      anotar(
        "payment.created",
        "payment",
        pago.id as string,
        `Pago de ${nombreDe(alumno)}: ${etiqueta} del ${cobertura.desde} al ${cobertura.hasta}`,
        pago.fechaPago as string,
        entre(0, 480),
      );
    }

    // Idempotente por contenido: el log es append-only, así que un segundo
    // `--reset` no puede "reemplazar" lo escrito — solo duplicarlo. Si ya
    // hay líneas de este padrón, no se agregan de nuevo.
    const [{ yaEscritas }] = await tx
      .select({ yaEscritas: sql<number>`count(*)::int` })
      .from(activityLog)
      .where(sql`${activityLog.gymId} = ${gymId} and ${activityLog.accion} = 'payment.created' and ${activityLog.resumen} like 'Pago de %'`);
    const escribirActividad = yaEscritas === 0;
    if (escribirActividad) await tx.insert(activityLog).values(filasActividad);

    console.log("✓ Padrón de demostración creado (nombres e historia ficticios).");
    console.log(
      `  ${alumnos.length} alumnos · ${filasPago.length} pagos · ${filasPeriodo.length} tramos de cobertura · ${filasAsistencia.length} marcas de asistencia`,
    );
    console.log(
      escribirActividad
        ? `  ${filasActividad.length} líneas de actividad`
        : `  actividad: ya había líneas de una corrida anterior; no se duplican (el log es append-only)`,
    );
    console.log(`  hoy = ${hoy} (zona horaria del gimnasio)`);
  });

  await client.end({ timeout: 5 });
}

main().catch((err) => {
  console.error("✗ Seed de demo falló:", err);
  process.exit(1);
});
