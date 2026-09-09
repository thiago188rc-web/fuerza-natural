import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { esAppUserUtilizable, resolverDestinoLogin, MENSAJES_LOGIN } from "@/lib/auth/flujo-login";

/**
 * El flujo de autenticación real (Supabase Auth, solo email + contraseña —
 * ver docs/DECISIONES.md sobre por qué no hay verificación en dos pasos),
 * en las dos mitades que se pueden verificar sin un proyecto Supabase de
 * verdad:
 *
 *   1. Las decisiones puras: a dónde va cada usuario después de la
 *      contraseña, y qué le decimos cuando no puede entrar.
 *   2. La barrera real: withAuth(), con getAuthContext() simulado.
 *
 * El aislamiento entre gimnasios NO se testea acá porque no es una decisión
 * de este flujo sino de RLS: vive en tests/integration/tenant-isolation.ts,
 * contra Postgres real.
 */

const { getAuthContextMock } = vi.hoisted(() => ({ getAuthContextMock: vi.fn() }));

vi.mock("@/lib/auth/context", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...real, getAuthContext: getAuthContextMock };
});

const { withAuth } = await import("@/use-cases/_kernel/with-auth");

describe("a dónde va el usuario después de validar la contraseña", () => {
  it("un usuario de Supabase sin fila en app_users no entra, y se le dice por qué", () => {
    const decision = resolverDestinoLogin(null);
    expect(decision).toEqual({ clase: "error", mensaje: MENSAJES_LOGIN.noVinculado });
  });

  it("un usuario desactivado no entra, con un mensaje distinto al de no vinculado", () => {
    const decision = resolverDestinoLogin({ rol: "DUENO", activo: false });
    expect(decision).toEqual({ clase: "error", mensaje: MENSAJES_LOGIN.inactivo });
    expect(MENSAJES_LOGIN.inactivo).not.toBe(MENSAJES_LOGIN.noVinculado);
  });

  it("un rol que no es DUENO ni STAFF nunca entra, aunque la fila exista y esté activa", () => {
    const decision = resolverDestinoLogin({ rol: "ADMIN", activo: true });
    expect(decision).toEqual({ clase: "error", mensaje: MENSAJES_LOGIN.noVinculado });
  });

  it("DUENO activo va directo al dashboard", () => {
    expect(resolverDestinoLogin({ rol: "DUENO", activo: true })).toEqual({
      clase: "destino",
      a: "/dashboard",
    });
  });

  it("STAFF activo va directo al dashboard", () => {
    expect(resolverDestinoLogin({ rol: "STAFF", activo: true })).toEqual({
      clase: "destino",
      a: "/dashboard",
    });
  });
});

describe("qué fila de app_users habilita a usar el sistema", () => {
  it("acepta DUENO y STAFF activos", () => {
    expect(esAppUserUtilizable({ rol: "DUENO", activo: true })).toBe(true);
    expect(esAppUserUtilizable({ rol: "STAFF", activo: true })).toBe(true);
  });

  it("rechaza inactivos, roles desconocidos y la ausencia de fila", () => {
    expect(esAppUserUtilizable({ rol: "DUENO", activo: false })).toBe(false);
    expect(esAppUserUtilizable({ rol: "ADMIN", activo: true })).toBe(false);
    expect(esAppUserUtilizable(null)).toBe(false);
    expect(esAppUserUtilizable(undefined)).toBe(false);
  });
});

describe("withAuth: la barrera real, con la sesión simulada", () => {
  const handler = vi.fn(async () => ({ ok: true as const, data: "secreto" }));
  const soloDueno = withAuth<void, string>(["DUENO"], handler);
  const duenoYStaff = withAuth<void, string>(["DUENO", "STAFF"], handler);

  beforeEach(() => {
    handler.mockClear();
    getAuthContextMock.mockReset();
  });

  function sesion(rol: string) {
    getAuthContextMock.mockResolvedValue({
      userId: "u1",
      gymId: "g1",
      rol,
      email: "persona@gimnasio.test",
      nombre: "Persona",
    });
  }

  it("sin sesión no pasa nada", async () => {
    getAuthContextMock.mockResolvedValue(null);
    const r = await duenoYStaff();
    expect(r).toMatchObject({ ok: false, kind: "FORBIDDEN" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("DUENO opera con normalidad", async () => {
    sesion("DUENO");
    const r = await duenoYStaff();
    expect(r).toEqual({ ok: true, data: "secreto" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("STAFF opera en lo que tiene permitido", async () => {
    sesion("STAFF");
    const r = await duenoYStaff();
    expect(r).toEqual({ ok: true, data: "secreto" });
  });

  it("STAFF no entra a lo que es solo del dueño", async () => {
    sesion("STAFF");
    const r = await soloDueno();
    expect(r.ok).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});

/**
 * REGRESIÓN DE UN BYPASS REAL (encontrado al implementar la autenticación
 * de producción). Hubo una versión en la que, con la sesión simulada
 * habilitada:
 *
 *   - el middleware le seteaba la cookie `dev_mock_auth_id` a CUALQUIER
 *     visitante, y
 *   - getAuthContext() devolvía el usuario demo aunque no hubiera cookie.
 *
 * Cualquiera de las dos cosas, sola, convierte a un visitante anónimo en
 * DUENO sin escribir una contraseña. La identidad simulada la entrega SOLO
 * el formulario de login.
 */
describe("nadie recibe una identidad sin pasar por el formulario de login", () => {
  const raiz = process.cwd();

  it("el middleware no escribe la cookie de sesión simulada", () => {
    const fuente = readFileSync(join(raiz, "src", "proxy.ts"), "utf-8");
    expect(fuente).not.toMatch(/cookies\s*\.\s*set\s*\(\s*DEV_MOCK_AUTH_COOKIE/);
    expect(fuente).not.toContain("00000000-0000-0000-0000-000000000001");
  });

  it("sin cookie, getAuthContext no inventa una identidad", () => {
    const fuente = readFileSync(join(raiz, "src", "lib", "auth", "context.ts"), "utf-8");
    const lectura = fuente.slice(
      fuente.indexOf("async function leerMockAuthIdDeDesarrollo"),
      fuente.indexOf("export const getAuthContext"),
    );
    expect(lectura).toContain("?? null");
    expect(lectura).not.toContain("00000000-0000-0000-0000-000000000001");
  });

  it("solo el formulario de login entrega la identidad simulada", () => {
    const fuente = readFileSync(join(raiz, "src", "app", "(auth)", "login", "actions.ts"), "utf-8");
    expect(fuente).toContain("isDevMockAuthEnabled()");
    expect(fuente).toContain("cookieStore.set(DEV_MOCK_AUTH_COOKIE");
  });
});
