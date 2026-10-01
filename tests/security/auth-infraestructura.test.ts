import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { DynamicServerError } from "next/dist/client/components/hooks-server-context";
import { MENSAJES_LOGIN, esFalloDeInfraestructuraAuth } from "@/lib/auth/flujo-login";

/**
 * REGRESIÓN DE UN INCIDENTE REAL (producción, 2026-10-01). El proyecto
 * Supabase dejó de responder (DNS ENOTFOUND) y el sistema lo contó como
 * otra cosa:
 *
 *   - `getUser()` NO lanza ante un fallo de red: devuelve
 *     `{ user: null, error: AuthRetryableFetchError }`. getAuthContext() lo
 *     leía como "no hay sesión" y mandaba a /login a un usuario con la
 *     sesión perfectamente válida.
 *   - En /login, `signInWithPassword()` devolvía el mismo error y la
 *     pantalla decía "Email o contraseña incorrectos" con la contraseña
 *     correcta.
 *
 * "No pudimos preguntar" nunca es "la respuesta es no". Y aparte: el catch
 * de getAuthContext() se tragaba el error de control de Next.js que
 * `cookies()` lanza al prerenderizar (DYNAMIC_SERVER_USAGE) — ver
 * `unstable_rethrow` en la documentación de Next 16.
 */

const { getUserMock, signInMock, signOutMock, crearClienteMock, buscarAppUserMock } = vi.hoisted(
  () => ({
    getUserMock: vi.fn(),
    signInMock: vi.fn(),
    signOutMock: vi.fn(),
    crearClienteMock: vi.fn(),
    buscarAppUserMock: vi.fn(),
  }),
);

vi.mock("@/lib/auth/supabase-server", () => ({ createSupabaseServerClient: crearClienteMock }));
vi.mock("@/lib/auth/app-user", () => ({ buscarAppUserPorAuthId: buscarAppUserMock }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} }),
}));

const { getAuthContext } = await import("@/lib/auth/context");
const { login } = await import("@/app/(auth)/login/actions");

const ENV_ORIGINAL = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

const FILA_DUENO = {
  id: "u1",
  gymId: "g1",
  rol: "DUENO",
  activo: true,
  email: "dueno@gimnasio.test",
  nombre: "Dueño",
};

function formulario(email = "dueno@gimnasio.test", password = "una-contraseña") {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
}

beforeEach(() => {
  // Con Supabase "real" configurado: la sesión simulada queda apagada y
  // getAuthContext() pasa por getUser().
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto-real.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "una-anon-key-real";
  getUserMock.mockReset();
  signInMock.mockReset();
  signOutMock.mockReset().mockResolvedValue({ error: null });
  buscarAppUserMock.mockReset().mockResolvedValue(FILA_DUENO);
  crearClienteMock
    .mockReset()
    .mockResolvedValue({ auth: { getUser: getUserMock, signInWithPassword: signInMock, signOut: signOutMock } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

afterAll(() => {
  if (ENV_ORIGINAL.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ENV_ORIGINAL.url;
  if (ENV_ORIGINAL.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ENV_ORIGINAL.key;
});

describe("qué error de Supabase Auth es 'no pudimos preguntar'", () => {
  it("red caída, DNS, timeout del gateway: sí", () => {
    expect(esFalloDeInfraestructuraAuth(new AuthRetryableFetchError("fetch failed", 0))).toBe(true);
    expect(esFalloDeInfraestructuraAuth(new AuthRetryableFetchError("Bad Gateway", 502))).toBe(true);
    expect(esFalloDeInfraestructuraAuth(new AuthApiError("Internal Server Error", 500, undefined))).toBe(
      true,
    );
  });

  it("sin sesión, token inválido, contraseña incorrecta o rate limit: no", () => {
    expect(esFalloDeInfraestructuraAuth(new AuthSessionMissingError())).toBe(false);
    expect(esFalloDeInfraestructuraAuth(new AuthApiError("invalid JWT", 403, "bad_jwt"))).toBe(false);
    expect(
      esFalloDeInfraestructuraAuth(new AuthApiError("Invalid login credentials", 400, "invalid_credentials")),
    ).toBe(false);
    expect(esFalloDeInfraestructuraAuth(new AuthApiError("Too many requests", 429, undefined))).toBe(false);
    expect(esFalloDeInfraestructuraAuth(null)).toBe(false);
  });
});

describe("getAuthContext distingue 'sin sesión' de 'Supabase no respondió'", () => {
  it("si getUser() no pudo llegar a Supabase, NO devuelve null: falla", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError("fetch failed", 0),
    });
    await expect(getAuthContext()).rejects.toThrow();
    expect(buscarAppUserMock).not.toHaveBeenCalled();
  });

  it("si Supabase Auth responde 5xx, tampoco es 'sin sesión'", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Internal Server Error", 500, undefined),
    });
    await expect(getAuthContext()).rejects.toThrow();
  });

  it("sin cookie de sesión sigue siendo un visitante anónimo", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    await expect(getAuthContext()).resolves.toBeNull();
  });

  it("con un token inválido o vencido sigue siendo un visitante anónimo", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("invalid JWT", 403, "bad_jwt"),
    });
    await expect(getAuthContext()).resolves.toBeNull();
  });

  it("con sesión válida y usuario activo, construye el contexto", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null });
    await expect(getAuthContext()).resolves.toEqual({
      userId: "u1",
      gymId: "g1",
      rol: "DUENO",
      email: "dueno@gimnasio.test",
      nombre: "Dueño",
    });
    expect(buscarAppUserMock).toHaveBeenCalledWith("auth-1");
  });

  it("con sesión válida pero usuario desactivado, no entra", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null });
    buscarAppUserMock.mockResolvedValue({ ...FILA_DUENO, activo: false });
    await expect(getAuthContext()).resolves.toBeNull();
  });

  it("no se traga el error de control de Next.js que lanza cookies() al prerenderizar", async () => {
    const control = new DynamicServerError(
      "Route / couldn't be rendered statically because it used `cookies`.",
    );
    crearClienteMock.mockRejectedValue(control);
    await expect(getAuthContext()).rejects.toBe(control);
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("login: un Supabase caído no se informa como contraseña incorrecta", () => {
  it("fallo de red en signInWithPassword → 'no pudimos conectar'", async () => {
    signInMock.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthRetryableFetchError("fetch failed", 0),
    });
    await expect(login({}, formulario())).resolves.toEqual({ error: MENSAJES_LOGIN.sinConexion });
  });

  it("Supabase que no contesta a tiempo → 'no pudimos conectar'", async () => {
    vi.useFakeTimers();
    signInMock.mockReturnValue(new Promise(() => {}));
    const resultado = login({}, formulario());
    await vi.advanceTimersByTimeAsync(6_500);
    await expect(resultado).resolves.toEqual({ error: MENSAJES_LOGIN.sinConexion });
  });

  it("contraseña incorrecta sigue diciendo exactamente eso, sin más detalle", async () => {
    signInMock.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });
    await expect(login({}, formulario())).resolves.toEqual({ error: MENSAJES_LOGIN.credenciales });
  });

  it("el rate limit de Supabase no se distingue de una contraseña incorrecta", async () => {
    signInMock.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("Too many requests", 429, undefined),
    });
    await expect(login({}, formulario())).resolves.toEqual({ error: MENSAJES_LOGIN.credenciales });
  });

  it("credenciales válidas y usuario activo → dashboard", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "auth-1" }, session: {} }, error: null });
    await expect(login({}, formulario())).resolves.toEqual({ redirectTo: "/dashboard" });
  });

  it("si la base no responde después de la contraseña, se cierra la sesión y se dice 'no pudimos conectar'", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "auth-1" }, session: {} }, error: null });
    buscarAppUserMock.mockRejectedValue(new Error("connect ECONNREFUSED"));
    await expect(login({}, formulario())).resolves.toEqual({ error: MENSAJES_LOGIN.sinConexion });
    expect(signOutMock).toHaveBeenCalledOnce();
  });
});
