import { describe, it, expect } from "vitest";
import { esBaseLocal, exigirBaseLocal, hostDeLaBase } from "../../scripts/db/destino";

/**
 * La barrera que impide que tests y semillas escriban en una base remota.
 * Las URLs son inventadas: ninguna credencial real.
 */
describe("exigirBaseLocal", () => {
  it("acepta las bases de esta máquina", () => {
    for (const url of [
      "postgres://fn_app@127.0.0.1:5497/fz_tests",
      "postgresql://fn_app:x@localhost:5433/fuerza_natural",
      "postgres://fn_app@[::1]:5432/db",
    ]) {
      expect(esBaseLocal(url), url).toBe(true);
      expect(() => exigirBaseLocal(url, "tests")).not.toThrow();
    }
  });

  it("rechaza un pooler de Supabase y cualquier host remoto", () => {
    for (const url of [
      "postgresql://fn_app.abcdefghijklmnop:clave@aws-0-us-east-1.pooler.supabase.co:6543/postgres",
      "postgres://u:p@db.abcdefghijklmnop.supabase.co:5432/postgres",
      "postgres://u:p@10.0.0.5:5432/db",
    ]) {
      expect(() => exigirBaseLocal(url, "tests"), url).toThrow(/se niega/);
    }
  });

  it("el error nombra el host pero nunca la contraseña", () => {
    const url = "postgresql://fn_app:SECRETO-NO-MOSTRAR@aws-0-us-west-2.pooler.supabase.co:6543/postgres";
    expect(() => exigirBaseLocal(url, "tests")).toThrow(/aws-0-us-west-2\.pooler\.supabase\.co/);
    try {
      exigirBaseLocal(url, "tests");
    } catch (err) {
      expect((err as Error).message).not.toContain("SECRETO-NO-MOSTRAR");
    }
  });

  it("una URL ilegible cuenta como remota: ante la duda, no se escribe", () => {
    expect(hostDeLaBase("esto no es una url")).toBeNull();
    expect(() => exigirBaseLocal("esto no es una url", "tests")).toThrow();
  });

  it("sin URL no hay nada que proteger (los tests de integración se saltan)", () => {
    expect(() => exigirBaseLocal(undefined, "tests")).not.toThrow();
  });
});
