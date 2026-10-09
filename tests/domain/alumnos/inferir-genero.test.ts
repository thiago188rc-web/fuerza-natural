import { describe, it, expect } from "vitest";
import { inferirGeneroDesdeNombre } from "@/domain/alumnos/inferir-genero";

describe("inferirGeneroDesdeNombre", () => {
  it("reconoce nombres femeninos comunes", () => {
    expect(inferirGeneroDesdeNombre("María")).toBe("FEMENINO");
    expect(inferirGeneroDesdeNombre("Carolina")).toBe("FEMENINO");
    expect(inferirGeneroDesdeNombre("Jimena")).toBe("FEMENINO");
  });

  it("reconoce nombres masculinos comunes", () => {
    expect(inferirGeneroDesdeNombre("Diego")).toBe("MASCULINO");
    expect(inferirGeneroDesdeNombre("Martín")).toBe("MASCULINO");
    expect(inferirGeneroDesdeNombre("Facundo")).toBe("MASCULINO");
  });

  it("ignora mayúsculas y acentos", () => {
    expect(inferirGeneroDesdeNombre("VERONICA")).toBe("FEMENINO");
    expect(inferirGeneroDesdeNombre("martin")).toBe("MASCULINO");
  });

  it("con nombre compuesto, el primero decide", () => {
    expect(inferirGeneroDesdeNombre("Juan Carlos")).toBe("MASCULINO");
    expect(inferirGeneroDesdeNombre("Maria Jose")).toBe("FEMENINO");
  });

  it("excepciones de terminación en 'a' que son masculinas", () => {
    expect(inferirGeneroDesdeNombre("Luca")).toBe("MASCULINO");
  });

  it("heurística de respaldo por terminación, para nombres fuera de la lista", () => {
    expect(inferirGeneroDesdeNombre("Brisa")).toBe("FEMENINO");
    expect(inferirGeneroDesdeNombre("Rodolfo")).toBe("MASCULINO");
  });

  it("un nombre sin patrón confiable queda sin clasificar", () => {
    expect(inferirGeneroDesdeNombre("Xyz")).toBeNull();
    expect(inferirGeneroDesdeNombre("")).toBeNull();
    expect(inferirGeneroDesdeNombre("   ")).toBeNull();
  });
});
