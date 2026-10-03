import { getSql } from "@/data/db";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/auth/config";
import { registrarError } from "@/lib/registro-seguro";

/**
 * GET /api/salud — para un monitor externo (UptimeRobot, Better Stack…) y
 * para confirmar qué versión está publicada después de un deploy.
 *
 * Contesta 200 si la base y Supabase Auth responden, 503 si alguna no. No
 * lee ninguna tabla del negocio (`select 1`), no devuelve URLs, claves ni
 * mensajes de error: solo "ok"/"error" por pieza y el commit publicado.
 * Es público a propósito: un monitor no tiene sesión.
 */

const TIEMPO_MAXIMO_MS = 4000;

function conTiempoMaximo<T>(promesa: Promise<T>): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIEMPO_MAXIMO_MS)),
  ]);
}

async function revisarBase(): Promise<"ok" | "error"> {
  try {
    await conTiempoMaximo(getSql()`select 1`);
    return "ok";
  } catch (err) {
    registrarError("[salud] la base no respondió:", err);
    return "error";
  }
}

async function revisarAuth(): Promise<"ok" | "error" | "sin configurar"> {
  if (!isSupabaseConfigured()) return "sin configurar";
  try {
    const respuesta = await conTiempoMaximo(
      fetch(`${supabaseUrl()}/auth/v1/health`, {
        headers: { apikey: supabaseAnonKey() },
        cache: "no-store",
      }),
    );
    return respuesta.ok ? "ok" : "error";
  } catch (err) {
    registrarError("[salud] Supabase Auth no respondió:", err);
    return "error";
  }
}

export async function GET() {
  const [base, auth] = await Promise.all([revisarBase(), revisarAuth()]);
  const sano = base === "ok" && auth !== "error";
  return Response.json(
    {
      estado: sano ? "ok" : "degradado",
      base,
      auth,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    },
    { status: sano ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
