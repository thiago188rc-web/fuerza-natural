import type { Genero } from "@/domain/alumnos/genero";

/**
 * Heurística para clasificar género a partir del nombre de pila, en
 * español rioplatense — para la clasificación automática masiva que pidió
 * el dueño (ver `clasificarGeneroAutomaticamenteAction`). El sistema no
 * la usa al crear un alumno nuevo: ahí género sigue siendo 100% manual y
 * opcional (ver `domain/alumnos/genero.ts`).
 *
 * Devuelve `null` cuando no hay certeza razonable — un nombre ambiguo o
 * desconocido queda "sin dato", nunca se fuerza una clasificación con
 * aire de moneda al aire.
 */

// Nombres de pila más frecuentes en Argentina, de uso corriente en un
// gimnasio (no es un diccionario exhaustivo: cubre el grueso real, el
// resto cae en la heurística de terminación o en `null`).
const FEMENINOS = new Set([
  "maria", "ana", "laura", "andrea", "paula", "carolina", "valeria", "natalia",
  "lucia", "luciana", "florencia", "camila", "julieta", "agustina", "sofia",
  "sofía", "martina", "victoria", "valentina", "jimena", "romina", "daniela",
  "gabriela", "patricia", "claudia", "silvia", "mariana", "veronica", "verónica",
  "alejandra", "cecilia", "marcela", "monica", "mónica", "liliana", "susana",
  "graciela", "norma", "beatriz", "elena", "adriana", "sandra", "viviana",
  "miriam", "mirta", "nora", "elsa", "ines", "inés", "noelia", "yanina",
  "melina", "micaela", "ailen", "ailén", "antonella", "belen", "belén", "brenda",
  "carla", "cintia", "cynthia", "dalma", "delfina", "denise", "eliana",
  "emilia", "estefania", "estefanía", "eugenia", "evangelina", "fernanda",
  "gisela", "gisel", "guadalupe", "ivana", "jesica", "jessica", "josefina",
  "karen", "leila", "lorena", "luz", "macarena", "magali", "malena", "marina",
  "marisa", "marisol", "milagros", "nadia", "nancy", "olivia", "pamela",
  "pilar", "rocio", "rocío", "rosa", "rosana", "sabrina", "selena", "soledad",
  "tamara", "vanesa", "vanessa", "yamila", "yesica", "ayelen", "ayelén",
  "abril", "constanza", "catalina", "celeste", "clara", "daiana", "dana",
  "diana", "elizabeth", "estela", "estefany", "eva", "ivonne", "judith",
  "juana", "karina", "lara", "leticia", "lidia", "lilian", "luján", "lujan",
  "manuela", "margarita", "mabel", "mercedes", "milena", "nahiara", "natacha",
  "noemi", "noemí", "ornella", "paola", "perla", "priscila", "renata",
  "roxana", "ruth", "sara", "stefania", "stella", "teresa", "wanda", "ximena",
  "yael", "zulma", "jazmin", "jazmín", "azul", "amparo", "candela", "casandra",
  "flor", "salome", "salomé", "gisell", "shirley", "iris", "raquel", "evelyn",
  "isabel", "sol", "megan", "zoe", "maite", "stefani", "mery", "edith",
  "irupe", "grisel", "marilin", "anahi", "anahí", "jennifer", "rut",
  "araceli", "jaqueline", "paz",
]);

const MASCULINOS = new Set([
  "juan", "jose", "josé", "carlos", "jorge", "luis", "miguel", "roberto",
  "ricardo", "alberto", "daniel", "fernando", "eduardo", "raul", "raúl",
  "oscar", "óscar", "sergio", "pablo", "diego", "martin", "martín", "matias",
  "matías", "nicolas", "nicolás", "facundo", "federico", "franco", "gaston",
  "gastón", "gonzalo", "gustavo", "hernan", "hernán", "ignacio", "javier",
  "joaquin", "joaquín", "julian", "julián", "leandro", "leonardo", "lucas",
  "marcelo", "mariano", "maximiliano", "nahuel", "pedro", "rodrigo",
  "santiago", "sebastian", "sebastián", "tomas", "tomás", "agustin", "agustín",
  "alejandro", "alexis", "andres", "andrés", "angel", "ángel", "antonio",
  "armando", "arturo", "ariel", "augusto", "axel", "benjamin", "benjamín",
  "braian", "brian", "bruno", "cesar", "césar", "claudio", "cristian",
  "cristhian", "damian", "damián", "david", "dario", "darío", "dylan",
  "emanuel", "emiliano", "enzo", "ezequiel", "fabian", "fabián", "felipe",
  "fabio", "francisco", "gabriel", "german", "germán", "gerardo",
  "guillermo", "guido", "hector", "héctor", "hugo", "ivan", "iván", "jonatan",
  "jonathan", "jeremias", "jeremías", "jonas", "jonás", "kevin", "leon",
  "león", "leonel", "lionel", "lisandro", "manuel", "mario", "marcos",
  "maximo", "máximo", "mauricio", "mauro", "nestor", "néstor",
  "octavio", "omar", "osvaldo", "pascual", "patricio", "ramiro", "ramon",
  "ramón", "renzo", "rene", "rené", "rolando", "rogelio", "salvador",
  "samuel", "santino", "saul", "saúl", "segundo", "simon", "simón", "tobias",
  "tobías", "ulises", "valentin", "valentín", "victor", "víctor", "vicente",
  "walter", "william", "willian", "aaron", "aarón", "abel", "adrian",
  "adrián", "alan", "alexander", "alfredo", "elian", "elías", "elias",
  "esteban", "thiago", "tiago", "noel", "enrique", "israel", "ruben",
  "rubén", "john", "ian", "juanse", "ismael", "joel", "nelson", "jhony",
  "catriel",
]);

// Nombres masculinos de uso real en Argentina que terminan en "a" — la
// única terminación donde la heurística de respaldo (más abajo) erraría
// sistemáticamente si no se los sacara antes.
const EXCEPCIONES_TERMINACION_A: Record<string, Genero> = {
  luca: "MASCULINO",
};

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Clasifica el PRIMER nombre de pila (si vienen varios juntos, como
 * "Juan Carlos" o "Maria Jose", el primero manda — es el que define el
 * género gramatical del nombre compuesto en español).
 */
export function inferirGeneroDesdeNombre(nombreCompleto: string): Genero | null {
  const primerNombre = nombreCompleto.trim().split(/\s+/)[0];
  if (!primerNombre) return null;

  const clave = normalizar(primerNombre);
  if (clave.length === 0) return null;

  if (FEMENINOS.has(clave)) return "FEMENINO";
  if (MASCULINOS.has(clave)) return "MASCULINO";

  const excepcion = EXCEPCIONES_TERMINACION_A[clave];
  if (excepcion) return excepcion;

  // Heurística de respaldo, solo para lo que no está en ninguna lista:
  // en español, un nombre que termina en "a" no acentuada es femenino la
  // enorme mayoría de las veces; "o" es masculino casi siempre. Fuera de
  // esos dos finales no hay patrón confiable — se deja sin clasificar.
  if (clave.endsWith("a") && !clave.endsWith("ña")) return "FEMENINO";
  if (clave.endsWith("o")) return "MASCULINO";

  return null;
}
