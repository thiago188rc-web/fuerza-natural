import { normalizarTerminoBusqueda } from "@/domain/alumnos/busqueda";
import { normalizarTelefono, normalizarTexto } from "@/domain/alumnos/identidad";

/**
 * ANÁLISIS DE UNA PLANILLA DE ALUMNOS.
 *
 * Funciones puras: reciben las filas ya parseadas y devuelven qué se
 * entendió, qué no, y qué choca con lo que ya existe. No escriben nada.
 *
 * La regla que ordena todo esto: el análisis NUNCA arregla datos por su
 * cuenta. Marca el problema y propone; decidir es del humano. Un
 * importador que "corrige" solo es un importador que introduce errores
 * silenciosos en el padrón real.
 */

/** Los campos que la importación sabe leer. */
export const CAMPOS = [
  "nombre",
  "apellido",
  "telefono",
  "plan",
  "fechaAlta",
  "email",
  "documento",
  "notas",
] as const;

export type Campo = (typeof CAMPOS)[number];

export const ETIQUETA_CAMPO: Record<Campo, string> = {
  nombre: "Nombre",
  apellido: "Apellido",
  telefono: "Teléfono",
  plan: "Plan",
  fechaAlta: "Fecha de alta",
  email: "Email",
  documento: "Documento",
  notas: "Observaciones",
};

/** Encabezados que se reconocen para cada campo, ya normalizados. */
const SINONIMOS: Record<Campo, string[]> = {
  nombre: ["nombre", "nombres", "first name", "name"],
  apellido: ["apellido", "apellidos", "last name", "surname"],
  telefono: ["telefono", "tel", "celular", "cel", "whatsapp", "phone", "movil"],
  plan: ["plan", "modalidad", "dias", "dias por semana", "tipo"],
  fechaAlta: ["fecha de alta", "fecha alta", "alta", "ingreso", "fecha de ingreso", "desde"],
  email: ["email", "e mail", "correo", "mail"],
  documento: ["documento", "dni", "doc", "cedula", "cuil"],
  notas: ["notas", "observaciones", "obs", "comentarios", "nota"],
};

/**
 * Empareja cada columna del archivo con un campo conocido. Devuelve el
 * índice de columna por campo, o -1 si no se encontró.
 *
 * Es una PROPUESTA: la pantalla la muestra y deja cambiarla. Adivinar mal
 * y no dejar corregir es peor que no adivinar.
 */
export function detectarColumnas(encabezados: readonly string[]): Record<Campo, number> {
  const normalizados = encabezados.map((h) => normalizarTerminoBusqueda(h));
  const asignacion = {} as Record<Campo, number>;
  const usadas = new Set<number>();

  for (const campo of CAMPOS) {
    let encontrada = -1;

    // Coincidencia exacta primero; recién después, por contenido. Sin ese
    // orden, una columna "nombre del plan" se llevaría el campo "nombre".
    for (const sinonimo of SINONIMOS[campo]) {
      const exacta = normalizados.findIndex((h, i) => !usadas.has(i) && h === sinonimo);
      if (exacta !== -1) {
        encontrada = exacta;
        break;
      }
    }

    if (encontrada === -1) {
      for (const sinonimo of SINONIMOS[campo]) {
        const parcial = normalizados.findIndex((h, i) => !usadas.has(i) && h.includes(sinonimo));
        if (parcial !== -1) {
          encontrada = parcial;
          break;
        }
      }
    }

    if (encontrada !== -1) usadas.add(encontrada);
    asignacion[campo] = encontrada;
  }

  return asignacion;
}

export type GravedadDeProblema = "ERROR" | "AVISO";

export interface ProblemaDeFila {
  campo: Campo | "fila";
  gravedad: GravedadDeProblema;
  mensaje: string;
}

export interface FilaAnalizada {
  /** Número de línea en el archivo, contando el encabezado. */
  linea: number;
  nombre: string;
  apellido: string;
  telefono: string | null;
  plan: string | null;
  fechaAlta: string | null;
  email: string | null;
  documento: string | null;
  notas: string | null;
  problemas: ProblemaDeFila[];
  /** Coincide con un alumno que ya existe en el padrón. */
  duplicadoExistente: string | null;
  /** Coincide con otra fila del mismo archivo. */
  duplicadoEnArchivo: number | null;
}

export interface ResumenDelAnalisis {
  total: number;
  listas: number;
  conAvisos: number;
  conErrores: number;
  duplicadas: number;
  /** Nombres de plan del archivo que no existen en el gimnasio. */
  planesDesconocidos: string[];
}

export interface AlumnoExistente {
  id: string;
  nombre: string;
  apellido: string;
}

/**
 * Convierte una fecha escrita como la escribe la gente a ISO.
 *
 * Acepta 'DD/MM/AAAA', 'D-M-AA' y el ISO que ya viene bien. NO acepta
 * 'MM/DD/AAAA': en Argentina el 3/4 es el 3 de abril, y adivinar el orden
 * según el valor (porque un día 13 no puede ser mes) produce planillas
 * importadas con la mitad de las fechas dadas vuelta.
 */
export function normalizarFecha(valor: string): string | null {
  const limpio = valor.trim();
  if (!limpio) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return esFechaReal(limpio) ? limpio : null;

  const partes = limpio.split(/[/\-.]/).map((p) => p.trim());
  if (partes.length !== 3) return null;

  const [d, m, a] = partes;
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{2}$|^\d{4}$/.test(a)) return null;

  const anio = a.length === 2 ? `20${a}` : a;
  const iso = `${anio}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return esFechaReal(iso) ? iso : null;
}

function esFechaReal(iso: string): boolean {
  const [anio, mes, dia] = iso.split("-").map(Number);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return dia <= ultimo;
}

/** La clave con la que se comparan dos personas: nombre + apellido normalizados. */
export function claveDePersona(nombre: string, apellido: string): string {
  return normalizarTerminoBusqueda(`${nombre} ${apellido}`);
}

export function analizarFilas(
  filas: readonly (readonly string[])[],
  columnas: Record<Campo, number>,
  contexto: {
    planes: readonly string[];
    existentes: readonly AlumnoExistente[];
    /** Hoy, en la zona del gimnasio. Una fecha de alta futura es un error. */
    hoy: string;
  },
): { filas: FilaAnalizada[]; resumen: ResumenDelAnalisis } {
  const porClave = new Map<string, AlumnoExistente>();
  for (const e of contexto.existentes) {
    porClave.set(claveDePersona(e.nombre, e.apellido), e);
  }

  const planesConocidos = new Set(contexto.planes.map((p) => normalizarTerminoBusqueda(p)));
  const planesDesconocidos = new Set<string>();
  const vistasEnArchivo = new Map<string, number>();

  const analizadas: FilaAnalizada[] = filas.map((cruda, indice) => {
    const leer = (campo: Campo): string => {
      const columna = columnas[campo];
      if (columna < 0 || columna >= cruda.length) return "";
      return normalizarTexto(cruda[columna] ?? "");
    };

    const problemas: ProblemaDeFila[] = [];
    const nombre = leer("nombre");
    const apellido = leer("apellido");

    if (!nombre) {
      problemas.push({ campo: "nombre", gravedad: "ERROR", mensaje: "Falta el nombre." });
    }
    if (!apellido) {
      problemas.push({ campo: "apellido", gravedad: "ERROR", mensaje: "Falta el apellido." });
    }

    // El teléfono se NORMALIZA (se sacan espacios y guiones) pero nunca se
    // le inventa un prefijo de país: si no viene, no viene.
    const telefonoCrudo = leer("telefono");
    let telefono: string | null = null;
    if (telefonoCrudo) {
      const normalizado = normalizarTelefono(telefonoCrudo);
      if (/^\+[1-9]\d{7,14}$/.test(normalizado)) {
        telefono = normalizado;
      } else {
        problemas.push({
          campo: "telefono",
          gravedad: "AVISO",
          mensaje: "El teléfono no está en formato internacional (+549…). Se va a importar vacío.",
        });
      }
    }

    const planCrudo = leer("plan");
    let plan: string | null = null;
    if (planCrudo) {
      if (planesConocidos.has(normalizarTerminoBusqueda(planCrudo))) {
        plan = planCrudo;
      } else {
        planesDesconocidos.add(planCrudo);
        problemas.push({
          campo: "plan",
          gravedad: "ERROR",
          mensaje: `El plan “${planCrudo}” no existe en el gimnasio.`,
        });
      }
    } else {
      problemas.push({
        campo: "plan",
        gravedad: "ERROR",
        mensaje: "Falta el plan. Todo alumno tiene que tener uno.",
      });
    }

    const fechaCruda = leer("fechaAlta");
    let fechaAlta: string | null = null;
    if (fechaCruda) {
      fechaAlta = normalizarFecha(fechaCruda);
      if (!fechaAlta) {
        problemas.push({
          campo: "fechaAlta",
          gravedad: "AVISO",
          mensaje: `No se entiende la fecha “${fechaCruda}”. Se va a usar la de hoy.`,
        });
      } else if (fechaAlta > contexto.hoy) {
        problemas.push({
          campo: "fechaAlta",
          gravedad: "ERROR",
          mensaje: "La fecha de alta es posterior a hoy.",
        });
      }
    }

    const clave = claveDePersona(nombre, apellido);
    const existente = clave ? (porClave.get(clave) ?? null) : null;
    const previa = clave ? vistasEnArchivo.get(clave) : undefined;
    if (clave && previa === undefined) vistasEnArchivo.set(clave, indice + 2);

    return {
      linea: indice + 2,
      nombre,
      apellido,
      telefono,
      plan,
      fechaAlta,
      email: leer("email") || null,
      documento: leer("documento") || null,
      notas: leer("notas") || null,
      problemas,
      duplicadoExistente: existente ? `${existente.nombre} ${existente.apellido}` : null,
      duplicadoEnArchivo: previa ?? null,
    };
  });

  const conErrores = analizadas.filter((f) =>
    f.problemas.some((p) => p.gravedad === "ERROR"),
  ).length;
  const duplicadas = analizadas.filter(
    (f) => f.duplicadoExistente !== null || f.duplicadoEnArchivo !== null,
  ).length;
  const conAvisos = analizadas.filter(
    (f) =>
      f.problemas.some((p) => p.gravedad === "AVISO") &&
      !f.problemas.some((p) => p.gravedad === "ERROR"),
  ).length;

  return {
    filas: analizadas,
    resumen: {
      total: analizadas.length,
      conErrores,
      conAvisos,
      duplicadas,
      // Contadas aparte y no restando: una fila puede tener error Y ser
      // duplicada, y restar las dos cantidades daría un total negativo.
      listas: analizadas.filter(
        (f) =>
          !f.problemas.some((p) => p.gravedad === "ERROR") &&
          f.duplicadoExistente === null &&
          f.duplicadoEnArchivo === null,
      ).length,
      planesDesconocidos: [...planesDesconocidos],
    },
  };
}
