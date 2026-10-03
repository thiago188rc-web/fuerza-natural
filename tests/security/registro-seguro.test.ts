import { describe, it, expect, vi, afterEach } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import { redactar, resumirError } from "@/lib/registro-seguro";

/**
 * Los logs del servidor no llevan datos de los alumnos. Los datos de abajo
 * son INVENTADOS; lo que se prueba es que ninguno llega al log.
 */

const sesion = vi.hoisted(() => ({ ctx: null as AuthContext | null }));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...actual, getAuthContext: async () => sesion.ctx };
});
const { withAuth } = await import("@/use-cases/_kernel/with-auth");

const DATOS_PERSONALES = ["Lucía", "Pereyra", "+5492804001234", "30123456", "Calle Falsa 123", "lucia@ejemplo.test"];

/** Un error con la misma forma que el que tira Drizzle cuando falla un INSERT. */
function errorDeDrizzle(): Error {
  const pg = Object.assign(
    new Error('duplicate key value violates unique constraint "students_gym_documento_key"'),
    {
      name: "PostgresError",
      severity: "ERROR",
      code: "23505",
      constraint_name: "students_gym_documento_key",
      table_name: "students",
      routine: "_bt_check_unique",
      detail: "Key (gym_id, documento)=(11111111-2222-4333-8444-555555555555, 30123456) already exists.",
    },
  );
  const params = ["Lucía", "Pereyra", "+5492804001234", "30123456", "Calle Falsa 123", "lucia@ejemplo.test"];
  const err = new Error(
    `Failed query: insert into "app"."students" (...) values ($1, $2, $3, $4, $5, $6)\nparams: ${params.join(",")}`,
    { cause: pg },
  );
  err.name = "DrizzleQueryError";
  return Object.assign(err, { query: 'insert into "app"."students"', params });
}

describe("resumirError", () => {
  it("de un error de consulta conserva el diagnóstico y descarta los datos", () => {
    const linea = JSON.stringify(resumirError(errorDeDrizzle()));
    for (const dato of DATOS_PERSONALES) expect(linea, dato).not.toContain(dato);
    expect(linea).toContain("23505");
    expect(linea).toContain("students_gym_documento_key");
    expect(linea).toContain("students");
  });

  it("el mensaje de Postgres no se copia: puede citar el valor rechazado", () => {
    const err = Object.assign(new Error('invalid input syntax for type uuid: "30123456"'), {
      severity: "ERROR",
      code: "22P02",
      routine: "string_to_uuid",
    });
    const linea = JSON.stringify(resumirError(err));
    expect(linea).not.toContain("30123456");
    expect(linea).toContain("22P02");
  });

  it("un error común conserva el mensaje, sin emails, teléfonos ni tokens", () => {
    const linea = JSON.stringify(
      resumirError(new Error("falló el envío a lucia@ejemplo.test, tel +54 9 280 400-1234, token sbp_0123456789abcdefABCDEF")),
    );
    expect(linea).toContain("falló el envío");
    expect(linea).not.toContain("lucia@ejemplo.test");
    expect(linea).not.toContain("400-1234");
    expect(linea).not.toContain("sbp_0123456789");
  });

  it("los UUID quedan: son internos y sin ellos no se sigue un error", () => {
    expect(redactar("pago 11111111-2222-4333-8444-555555555555 no encontrado")).toBe(
      "pago 11111111-2222-4333-8444-555555555555 no encontrado",
    );
  });
});

describe("withAuth no deja datos personales en el log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sesion.ctx = null;
  });

  it("ante un error inesperado devuelve el mensaje genérico y loguea solo el resumen", async () => {
    sesion.ctx = {
      userId: "11111111-1111-4111-8111-111111111111",
      gymId: "22222222-2222-4222-8222-222222222222",
      rol: "DUENO",
      email: "dueno@ejemplo.test",
      nombre: "Dueño",
    };
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});

    const accion = withAuth(["DUENO"], async () => {
      throw errorDeDrizzle();
    });
    const r = await accion({});

    expect(r).toEqual({ ok: false, kind: "CONFLICT", message: "Ocurrió un error inesperado. Intentá de nuevo." });
    expect(espia).toHaveBeenCalledTimes(1);
    const logueado = JSON.stringify(espia.mock.calls);
    for (const dato of DATOS_PERSONALES) expect(logueado, dato).not.toContain(dato);
    expect(logueado).toContain("23505");
  });
});
