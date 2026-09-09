import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  esAppUserUtilizable,
  modoMfa,
  resolverDestinoLogin,
  MENSAJES_LOGIN,
} from "@/lib/auth/flujo-login";

/**
 * El flujo de autenticación real (Supabase Auth + MFA TOTP), en las dos
 * mitades que se pueden verificar sin un proyecto Supabase de verdad:
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

const AAL1 = { currentLevel: "aal1", nextLevel: "aal1" };
const AAL1_CON_FACTOR = { currentLevel: "aal1", nextLevel: "aal2" };
const AAL2 = { currentLevel: "aal2", nextLevel: "aal2" };

describe("a dónde va el usuario después de validar la contraseña", () => {
  it("un usuario de Supabase sin fila en app_users no entra, y se le dice por qué", () => {
    const decision = resolverDestinoLogin(null, AAL1);
    expect(decision).toEqual({ clase: "error", mensaje: MENSAJES_LOGIN.noVinculado });
  });

  it("un usuario desactivado no entra, con un mensaje distinto al de no vinculado", () => {
    const decision = resolverDestinoLogin({ rol: "DUENO", activo: false }, AAL2);
    expect(decision).toEqual({ clase: "error", mensaje: MENSAJES_LOGIN.inactivo });
    expect(MENSAJES_LOGIN.inactivo).not.toBe(MENSAJES_LOGIN.noVinculado);
  });

  it("un rol que no es DUENO ni STAFF nunca entra, aunque la fila exista y esté activa", () => {
    const decision = resolverDestinoLogin({ rol: "ADMIN", activo: true }, AAL2);
    expect(decision).toEqual({ clase: "error", mensaje: MENSAJES_LOGIN.noVinculado });
  });

  it("DUENO sin segundo factor va a configurarlo, no al dashboard", () => {
    expect(resolverDestinoLogin({ rol: "DUENO", activo: true }, AAL1)).toEqual({
      clase: "destino",
      a: "/mfa",
    });
  });

  it("DUENO con segundo factor ya configurado va a ingresar el código", () => {
    expect(resolverDestinoLogin({ rol: "DUENO", activo: true }, AAL1_CON_FACTOR)).toEqual({
      clase: "destino",
      a: "/mfa",
    });
  });

  it("DUENO que ya está en aal2 entra al dashboard", () => {
    expect(resolverDestinoLogin({ rol: "DUENO", activo: true }, AAL2)).toEqual({
      clase: "destino",
      a: "/dashboard",
    });
  });

  it("STAFF sin segundo factor entra: aal2 todavía no se le exige", () => {
    expect(resolverDestinoLogin({ rol: "STAFF", activo: true }, AAL1)).toEqual({
      clase: "destino",
      a: "/dashboard",
    });
  });

  it("STAFF que sí configuró un segundo factor igual lo tiene que usar", () => {
    expect(resolverDestinoLogin({ rol: "STAFF", activo: true }, AAL1_CON_FACTOR)).toEqual({
      clase: "destino",
      a: "/mfa",
    });
  });

  it("si el nivel de MFA no se pudo leer, falla cerrado: DUENO va a /mfa", () => {
    expect(resolverDestinoLogin({ rol: "DUENO", activo: true }, null)).toEqual({
      clase: "destino",
      a: "/mfa",
    });
  });
});

describe("qué muestra la pantalla de verificación", () => {
  it("sin ningún factor verificado, hay que enrolar uno", () => {
    expect(modoMfa([], AAL1)).toBe("enroll");
  });

  it("con un factor verificado, hay que pedir el código", () => {
    expect(modoMfa([{ id: "f1" }], AAL1_CON_FACTOR)).toBe("challenge");
  });

  it("si la sesión ya está en aal2 no hay nada que verificar", () => {
    expect(modoMfa([{ id: "f1" }], AAL2)).toBe("listo");
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

  function sesion(rol: string, aal: string) {
    getAuthContextMock.mockResolvedValue({
      userId: "u1",
      gymId: "g1",
      rol,
      aal,
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

  it("DUENO en aal1 queda afuera: la contraseña sola no alcanza", async () => {
    sesion("DUENO", "aal1");
    const r = await duenoYStaff();
    expect(r.ok).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("DUENO en aal2 opera con normalidad", async () => {
    sesion("DUENO", "aal2");
    const r = await duenoYStaff();
    expect(r).toEqual({ ok: true, data: "secreto" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("STAFF opera en lo que tiene permitido sin segundo factor", async () => {
    sesion("STAFF", "aal1");
    const r = await duenoYStaff();
    expect(r).toEqual({ ok: true, data: "secreto" });
  });

  it("STAFF no entra a lo que es solo del dueño", async () => {
    sesion("STAFF", "aal1");
    const r = await soloDueno();
    expect(r.ok).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});

/**
 * La verificación de MFA fue un no-op durante toda la Fase 0/2: la pantalla
 * existía y el botón no verificaba nada. Si alguien la vuelve a vaciar,
 * DUENO no podría alcanzar aal2 nunca — o peor, se "arreglaría" aflojando
 * el requisito. Esto lo fija en el código fuente.
 */
describe("el segundo factor se verifica de verdad", () => {
  const raizApp = join(process.cwd(), "src", "app", "(auth)", "mfa");

  it("verificarMfa usa challengeAndVerify de Supabase", () => {
    const fuente = readFileSync(join(raizApp, "actions.ts"), "utf-8");
    expect(fuente).toContain("challengeAndVerify");
    expect(fuente).toContain("mfa.enroll");
  });

  it("getAuthContext decide con esAppUserUtilizable y no con una condición propia", () => {
    const fuente = readFileSync(join(process.cwd(), "src", "lib", "auth", "context.ts"), "utf-8");
    expect(fuente).toContain("esAppUserUtilizable(appUser)");
  });

  it("el rol DUENO sigue exigiendo aal2", () => {
    const fuente = readFileSync(join(process.cwd(), "src", "lib", "auth", "context.ts"), "utf-8");
    expect(fuente).toContain('return rol === "DUENO"');
  });
});
