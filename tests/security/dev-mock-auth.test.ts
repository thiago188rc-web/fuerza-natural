import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DEV_MOCK_AUTH_COOKIE, isDevMockAuthEnabled, isSupabaseConfigured } from "@/lib/auth/config";

/**
 * REGRESIÓN DE UNA VULNERABILIDAD REAL (encontrada al empezar Fase 1).
 *
 * Fase 0 dejó una cookie `dev_mock_auth_id` que `getAuthContext()` aceptaba
 * como identidad cuando Supabase no devolvía usuario — SIN condicionarla a
 * nada. En un despliegue de producción, cualquiera que mandara esa cookie
 * con un `auth_user_id` válido entraba como ese usuario y además con
 * `aal2`, salteándose el MFA que el sistema exige para DUENO. Que la
 * cookie sea `httpOnly` no protege: eso impide que la lea el JavaScript de
 * la página, no que un atacante la mande a mano.
 *
 * Estos tests fijan las dos condiciones que ahora la habilitan. Si alguien
 * afloja cualquiera de las dos, esto falla.
 */

const ENV_ORIGINAL = {
  NODE_ENV: process.env.NODE_ENV,
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

function setNodeEnv(valor: string) {
  // NODE_ENV es readonly en los tipos de Node; en runtime es una env var común.
  (process.env as Record<string, string | undefined>).NODE_ENV = valor;
}

function setSupabase(url: string | undefined, key: string | undefined) {
  if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  if (key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
}

beforeEach(() => {
  setNodeEnv("development");
  setSupabase(undefined, undefined);
});

afterAll(() => {
  setNodeEnv(ENV_ORIGINAL.NODE_ENV ?? "test");
  setSupabase(ENV_ORIGINAL.url, ENV_ORIGINAL.key);
});

describe("la sesión simulada de desarrollo está activa siempre que no exista Supabase configurado", () => {
  it("con Supabase sin configurar está habilitada para permitir despliegues de demo sin credenciales", () => {
    setNodeEnv("production");
    setSupabase(undefined, undefined);
    expect(isDevMockAuthEnabled()).toBe(true);
  });

  it("con placeholders también se considera no configurado y está habilitada", () => {
    setNodeEnv("production");
    setSupabase("https://placeholder.supabase.co", "placeholder-key");
    expect(isDevMockAuthEnabled()).toBe(true);
  });

  it("con Supabase real configurado queda deshabilitada tanto en producción como en desarrollo", () => {
    setNodeEnv("production");
    setSupabase("https://proyecto-real.supabase.co", "una-anon-key-real");
    expect(isDevMockAuthEnabled()).toBe(false);

    setNodeEnv("development");
    expect(isDevMockAuthEnabled()).toBe(false);
  });
});

describe("isSupabaseConfigured", () => {
  it("los placeholders no cuentan como configuración real", () => {
    setSupabase("https://placeholder.supabase.co", "placeholder-key");
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("una cadena vacía o de espacios no cuenta como configuración real", () => {
    setSupabase("   ", "   ");
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("exige URL y anon key: una sola no alcanza", () => {
    setSupabase("https://proyecto-real.supabase.co", undefined);
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("con las dos reales, sí", () => {
    setSupabase("https://proyecto-real.supabase.co", "una-anon-key-real");
    expect(isSupabaseConfigured()).toBe(true);
  });
});

/**
 * La condición vive en UN solo lugar. El bug original fue posible porque
 * había tres criterios distintos de "¿hay Supabase?" repartidos en tres
 * archivos: si el nombre de la cookie se vuelve a escribir a mano en algún
 * lado, es señal de que alguien está armando un segundo camino de entrada.
 */
describe("el nombre de la cookie no está hardcodeado fuera de config.ts", () => {
  const SRC = join(process.cwd(), "src");

  function listarFuentes(dir: string): string[] {
    const out: string[] = [];
    for (const entrada of readdirSync(dir)) {
      const full = join(dir, entrada);
      if (statSync(full).isDirectory()) out.push(...listarFuentes(full));
      else if (/\.tsx?$/.test(entrada)) out.push(full);
    }
    return out;
  }

  it("solo src/lib/auth/config.ts contiene el literal", () => {
    const infractores = listarFuentes(SRC)
      .filter((f) => !f.endsWith(join("lib", "auth", "config.ts")))
      .filter((f) => readFileSync(f, "utf-8").includes(DEV_MOCK_AUTH_COOKIE))
      .map((f) => relative(process.cwd(), f));

    expect(infractores).toEqual([]);
  });

  it("getAuthContext pasa por la puerta antes de leer la cookie", () => {
    const fuente = readFileSync(join(SRC, "lib", "auth", "context.ts"), "utf-8");
    expect(fuente).toContain("isDevMockAuthEnabled");
    expect(fuente).toContain("if (!isDevMockAuthEnabled()) return null;");
  });
});
