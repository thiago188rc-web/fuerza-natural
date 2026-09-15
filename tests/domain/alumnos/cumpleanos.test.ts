import { describe, it, expect } from "vitest";
import { cumpleanosDelMes } from "@/domain/alumnos/cumpleanos";

const HOY = "2026-09-07";

describe("cumpleanosDelMes", () => {
  it("solo incluye a quienes cumplen años en el mes de hoy, sin importar el año de nacimiento", () => {
    const alumnos = [
      { id: "1", nombre: "Ana", apellido: "Gómez", fechaNacimiento: "1990-09-15" },
      { id: "2", nombre: "Bruno", apellido: "Díaz", fechaNacimiento: "2001-08-20" }, // agosto, no cuenta
      { id: "3", nombre: "Caro", apellido: "Ruiz", fechaNacimiento: null },
    ];
    const resultado = cumpleanosDelMes(alumnos, HOY);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe("Ana");
  });

  it("marca esHoy solo cuando el día y el mes coinciden con hoy", () => {
    const alumnos = [
      { id: "1", nombre: "Hoy", apellido: "Persona", fechaNacimiento: "1985-09-07" },
      { id: "2", nombre: "Otro", apellido: "Día", fechaNacimiento: "1985-09-20" },
    ];
    const resultado = cumpleanosDelMes(alumnos, HOY);
    expect(resultado.find((a) => a.nombre === "Hoy")?.esHoy).toBe(true);
    expect(resultado.find((a) => a.nombre === "Otro")?.esHoy).toBe(false);
  });

  it("ordena por día del mes", () => {
    const alumnos = [
      { id: "1", nombre: "Tarde", apellido: "", fechaNacimiento: "1990-09-28" },
      { id: "2", nombre: "Temprano", apellido: "", fechaNacimiento: "1990-09-02" },
    ];
    const resultado = cumpleanosDelMes(alumnos, HOY);
    expect(resultado.map((a) => a.nombre)).toEqual(["Temprano", "Tarde"]);
  });

  it("lista vacía no rompe nada", () => {
    expect(cumpleanosDelMes([], HOY)).toEqual([]);
  });
});
