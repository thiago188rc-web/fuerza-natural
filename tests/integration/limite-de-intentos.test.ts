import { describe, it, expect, vi } from "vitest";
import { getSql } from "@/data/db";
import {
  bloqueadoHasta,
  claveDeIntento,
  limpiarFallos,
  registrarFallo,
} from "@/lib/auth/limite-de-intentos";

/**
 * El límite de intentos de acceso contra Postgres REAL, conectado como
 * fn_app (el rol de la app). Se salta si no hay DATABASE_URL.
 */

function claveNueva(): string {
  return claveDeIntento("test", crypto.randomUUID());
}

describe.skipIf(!process.env.DATABASE_URL)("límite de intentos (Postgres real)", () => {
  it("bloquea al llegar al máximo, y solo a esa clave", async () => {
    const clave = claveNueva();
    const otra = claveNueva();
    const limite = { maximo: 5, ventanaSegundos: 900 };

    for (let i = 1; i <= 4; i++) expect(await registrarFallo(clave, limite), `fallo ${i}`).toBeNull();
    const hasta = await registrarFallo(clave, limite);
    expect(hasta).toBeInstanceOf(Date);
    expect(hasta!.getTime()).toBeGreaterThan(Date.now() + 800_000);

    expect(await bloqueadoHasta([clave])).toBeInstanceOf(Date);
    expect(await bloqueadoHasta([otra])).toBeNull();
    // Basta con que UNA de las claves consultadas esté bloqueada.
    expect(await bloqueadoHasta([otra, clave])).toBeInstanceOf(Date);
  });

  it("un acceso correcto limpia el contador", async () => {
    const clave = claveNueva();
    const limite = { maximo: 2, ventanaSegundos: 900 };
    await registrarFallo(clave, limite);
    expect(await registrarFallo(clave, limite)).toBeInstanceOf(Date);
    await limpiarFallos(clave);
    expect(await bloqueadoHasta([clave])).toBeNull();
    expect(await registrarFallo(clave, limite)).toBeNull();
  });

  it("vencida la ventana, el contador vuelve a empezar", async () => {
    const clave = claveNueva();
    const limite = { maximo: 2, ventanaSegundos: 1 };
    expect(await registrarFallo(clave, limite)).toBeNull();
    await new Promise((r) => setTimeout(r, 1200));
    expect(await registrarFallo(clave, limite)).toBeNull();
  });

  it("la app no puede leer ni escribir la tabla directo: solo por las funciones", async () => {
    const sql = getSql();
    await expect(sql`select count(*) from app.access_attempts`).rejects.toMatchObject({ code: "42501" });
    await expect(
      sql`insert into app.access_attempts (clave) values (${claveNueva()})`,
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("la base no acepta claves legibles: solo hashes", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    // Un email en claro como clave: la función lo rechaza (CHECK) y el
    // límite no se cae — devuelve null y lo registra sin el email.
    expect(await registrarFallo("ana@ejemplo.test", { maximo: 1, ventanaSegundos: 60 })).toBeNull();
    expect(JSON.stringify(espia.mock.calls)).not.toContain("ana@ejemplo.test");
    espia.mockRestore();
  });
});
