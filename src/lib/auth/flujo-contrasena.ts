/**
 * Decisiones PURAS del cambio y la recuperación de contraseña: sin
 * Supabase, sin cookies, sin base. El I/O vive en
 * src/use-cases/cuenta/contrasena.ts, src/app/(auth)/recuperar/ y
 * src/app/auth/confirm/; lo que se puede decidir con datos ya leídos está
 * acá, cubierto por tests/security/flujo-contrasena.test.ts.
 */

export const MENSAJES_CONTRASENA = {
  actualIncorrecta: "La contraseña actual no es correcta.",
  debil: "Esa contraseña es muy fácil de adivinar. Probá con una más larga, que no uses en otro lado.",
  igual: "La contraseña nueva tiene que ser distinta de la actual.",
  reautenticar: "Por seguridad, cerrá sesión, volvé a entrar y probá de nuevo.",
  sinConexion: "No pudimos conectar con el sistema. Probá de nuevo en un momento.",
  noDisponible: "El cambio de contraseña no está disponible en este entorno (sin Supabase configurado).",
  demasiadosIntentos: "Demasiados intentos. Esperá 15 minutos y probá de nuevo.",
  recuperacionEnviada:
    "Si ese email tiene una cuenta, te llega un enlace para elegir una contraseña nueva. Revisá también la carpeta de spam.",
  enlaceInvalido: "El enlace venció o ya se usó. Pedí uno nuevo.",
} as const;

/** Largo mínimo propio de la app. Supabase permite 6 por defecto; acá se pide más. */
export const LARGO_MINIMO_CONTRASENA = 10;
/** bcrypt ignora lo que pasa de 72 bytes: más largo da una falsa sensación de seguridad. */
export const LARGO_MAXIMO_CONTRASENA = 72;

/** Cuánto vale una sesión de recuperación para elegir contraseña sin la actual. */
export const MINUTOS_DE_RECUPERACION = 15;

interface EntradaAmr {
  method?: unknown;
  timestamp?: unknown;
}

/**
 * ¿Hace falta pedir la contraseña actual?
 *
 * Sí, salvo que la sesión se haya abierto en los últimos 15 minutos con el
 * enlace de recuperación (AMR "recovery" u "otp" en el token, que firma
 * Supabase y se verifica en el servidor). Quien perdió la contraseña no la
 * puede escribir; quien tiene una sesión abierta sí, y pedírsela evita que
 * alguien que encuentre la sesión abierta en otra computadora se quede con
 * la cuenta.
 */
export function exigeContrasenaActual(amr: unknown, ahoraEnSegundos: number): boolean {
  if (!Array.isArray(amr)) return true;
  const limite = ahoraEnSegundos - MINUTOS_DE_RECUPERACION * 60;
  return !amr.some((entrada: EntradaAmr | string) => {
    if (typeof entrada === "string") return false; // formato sin fecha: no alcanza
    const metodo = entrada?.method;
    const cuando = entrada?.timestamp;
    return (
      (metodo === "recovery" || metodo === "otp") && typeof cuando === "number" && cuando >= limite
    );
  });
}

/** A dónde puede volver el enlace de recuperación. Nada que venga de afuera. */
const DESTINOS_PERMITIDOS = new Set(["/cuenta/contrasena"]);

export function destinoSeguro(siguiente: string | null | undefined): string {
  return siguiente && DESTINOS_PERMITIDOS.has(siguiente) ? siguiente : "/cuenta/contrasena";
}

/** El mensaje para cada error de `updateUser` que el usuario puede resolver. */
export function mensajeDeErrorAlCambiar(codigo: string | undefined): string {
  switch (codigo) {
    case "weak_password":
      return MENSAJES_CONTRASENA.debil;
    case "same_password":
      return MENSAJES_CONTRASENA.igual;
    case "reauthentication_needed":
    case "reauthentication_not_valid":
    case "session_not_found":
    case "session_expired":
      return MENSAJES_CONTRASENA.reautenticar;
    default:
      return "No pudimos cambiar la contraseña. Probá de nuevo.";
  }
}
