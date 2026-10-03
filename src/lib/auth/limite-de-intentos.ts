import { createHash } from "node:crypto";
import { getSql } from "@/data/db";
import { registrarError } from "@/lib/registro-seguro";

/**
 * Límite de intentos de acceso, compartido entre instancias del servidor.
 *
 * Supabase Auth tiene sus propios límites, pero los aplica por IP, y como
 * el login corre en el servidor, la IP que ve Supabase es la de Vercel: un
 * límite grueso, que además puede trabar al dueño durante un ataque. Este
 * cuenta con la IP real del visitante y vive en Postgres (tabla
 * `app.access_attempts`, solo accesible por funciones SECURITY DEFINER),
 * así que funciona igual con una instancia que con veinte.
 *
 * Si la base no responde, el límite NO bloquea el acceso: se registra el
 * error y el login sigue, protegido por los límites de Supabase. Es una
 * defensa secundaria; tumbar el login porque ella falló sería peor.
 */

export interface Limite {
  /** Fallos dentro de la ventana que disparan el bloqueo. */
  maximo: number;
  /** Duración de la ventana y del bloqueo, en segundos. */
  ventanaSegundos: number;
}

export const LIMITES = {
  /** La misma cuenta desde la misma IP: 5 contraseñas mal en 15 minutos. */
  loginPorCuenta: { maximo: 5, ventanaSegundos: 15 * 60 },
  /** Una IP probando muchas cuentas: 20 fallos en 15 minutos. */
  loginPorIp: { maximo: 20, ventanaSegundos: 15 * 60 },
  /** Pedidos de recuperación desde una IP: 5 por hora (cada uno manda un email). */
  recuperacionPorIp: { maximo: 5, ventanaSegundos: 60 * 60 },
  /** Contraseña actual mal al cambiarla, por usuario: 5 en 15 minutos. */
  contrasenaActual: { maximo: 5, ventanaSegundos: 15 * 60 },
} satisfies Record<string, Limite>;

/**
 * La clave de un contador: SHA-256 de las partes normalizadas. La tabla
 * nunca guarda el email ni la IP en claro.
 */
export function claveDeIntento(tipo: string, ...partes: string[]): string {
  const normalizado = [tipo, ...partes.map((p) => p.trim().toLowerCase())].join(":");
  return createHash("sha256").update(normalizado).digest("hex");
}

/**
 * La IP del visitante. En Vercel, `x-real-ip` y `x-forwarded-for` los
 * escribe la plataforma (no el cliente). Sin ninguno —desarrollo local— la
 * clave cae en un balde común.
 */
export function ipDelPedido(headers: Pick<Headers, "get">): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const reenviada = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return reenviada || "sin-ip";
}

/** ¿Alguna de las claves está bloqueada? Devuelve hasta cuándo, o null. */
export async function bloqueadoHasta(claves: string[]): Promise<Date | null> {
  try {
    const [fila] = await getSql()<{ hasta: Date | null }[]>`
      select app.acceso_bloqueado_hasta(${claves}::text[]) as hasta
    `;
    return fila?.hasta ?? null;
  } catch (err) {
    registrarError("[limite-de-intentos] no se pudo consultar:", err);
    return null;
  }
}

/** Suma un fallo. Devuelve hasta cuándo quedó bloqueada la clave, o null. */
export async function registrarFallo(clave: string, limite: Limite): Promise<Date | null> {
  try {
    const [fila] = await getSql()<{ hasta: Date | null }[]>`
      select app.registrar_fallo_de_acceso(${clave}, ${limite.maximo}, ${limite.ventanaSegundos}) as hasta
    `;
    return fila?.hasta ?? null;
  } catch (err) {
    registrarError("[limite-de-intentos] no se pudo registrar:", err);
    return null;
  }
}

/** Un acceso correcto limpia el contador de esa clave. */
export async function limpiarFallos(clave: string): Promise<void> {
  try {
    await getSql()`select app.limpiar_fallos_de_acceso(${clave})`;
  } catch (err) {
    registrarError("[limite-de-intentos] no se pudo limpiar:", err);
  }
}
