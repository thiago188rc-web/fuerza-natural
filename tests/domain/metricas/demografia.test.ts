import { describe, it, expect } from "vitest";
import {
  bucketDeEdad,
  distribucionPorEdad,
  distribucionPorEdadYGenero,
  distribucionPorGenero,
} from "@/domain/metricas/demografia";

const HOY = "2026-09-07";

describe("bucketDeEdad", () => {
  it("sin fecha de nacimiento cae en SIN_DATO", () => {
    expect(bucketDeEdad(null, HOY)).toBe("SIN_DATO");
  });

  it("cumpleaños todavía no llegó este año: resta un año", () => {
    // Nació el 2008-09-08, un día después de HOY: todavía tiene 17.
    expect(bucketDeEdad("2008-09-08", HOY)).toBe("MENOR_18");
  });

  it("cumpleaños ya pasó este año", () => {
    // Nació el 2008-09-06: ya cumplió 18.
    expect(bucketDeEdad("2008-09-06", HOY)).toBe("18_25");
  });

  it("bordes de cada franja", () => {
    expect(bucketDeEdad("2001-09-07", HOY)).toBe("18_25"); // cumple 25 hoy
    expect(bucketDeEdad("2000-09-06", HOY)).toBe("26_35"); // cumplió 26 ayer
    expect(bucketDeEdad("1970-01-01", HOY)).toBe("56_MAS");
  });
});

describe("distribucionPorEdad", () => {
  it("no excluye 'sin dato' del total", () => {
    const alumnos = [
      { fechaNacimiento: null },
      { fechaNacimiento: "2008-09-06" }, // 18_25
      { fechaNacimiento: "2008-09-06" }, // 18_25
    ];
    const dist = distribucionPorEdad(alumnos, HOY);
    const total = dist.reduce((acc, s) => acc + s.cantidad, 0);
    expect(total).toBe(3);
    expect(dist.find((s) => s.clave === "SIN_DATO")?.cantidad).toBe(1);
    expect(dist.find((s) => s.clave === "18_25")?.porcentaje).toBe(67);
  });

  it("lista vacía no produce NaN", () => {
    expect(distribucionPorEdad([], HOY)).toEqual([]);
  });

  it("omite segmentos sin ningún alumno", () => {
    const dist = distribucionPorEdad([{ fechaNacimiento: "2008-09-06" }], HOY);
    expect(dist).toHaveLength(1);
    expect(dist[0].clave).toBe("18_25");
  });
});

describe("distribucionPorGenero", () => {
  it("agrupa valores inválidos o nulos como SIN_DATO", () => {
    const alumnos = [{ genero: "FEMENINO" }, { genero: null }, { genero: "ALGO_RARO" }];
    const dist = distribucionPorGenero(alumnos);
    expect(dist.find((s) => s.clave === "FEMENINO")?.cantidad).toBe(1);
    expect(dist.find((s) => s.clave === "SIN_DATO")?.cantidad).toBe(2);
  });
});

describe("distribucionPorEdadYGenero", () => {
  it("el género se calcula DENTRO de cada rango etario, no sobre el total", () => {
    const alumnos = [
      { fechaNacimiento: "2008-09-06", genero: "FEMENINO" }, // 18_25
      { fechaNacimiento: "2008-09-06", genero: "FEMENINO" }, // 18_25
      { fechaNacimiento: "2008-09-06", genero: "MASCULINO" }, // 18_25
      { fechaNacimiento: "1970-01-01", genero: "MASCULINO" }, // 56_MAS
    ];
    const dist = distribucionPorEdadYGenero(alumnos, HOY);

    const jovenes = dist.find((s) => s.bucket === "18_25");
    expect(jovenes?.total).toBe(3);
    expect(jovenes?.porGenero.find((g) => g.clave === "FEMENINO")?.porcentaje).toBe(67);

    const mayores = dist.find((s) => s.bucket === "56_MAS");
    expect(mayores?.total).toBe(1);
    expect(mayores?.porGenero.find((g) => g.clave === "MASCULINO")?.porcentaje).toBe(100);
  });

  it("omite rangos etarios sin ningún alumno", () => {
    const dist = distribucionPorEdadYGenero(
      [{ fechaNacimiento: "2008-09-06", genero: "FEMENINO" }],
      HOY,
    );
    expect(dist).toHaveLength(1);
    expect(dist[0].bucket).toBe("18_25");
  });

  it("lista vacía no produce NaN", () => {
    expect(distribucionPorEdadYGenero([], HOY)).toEqual([]);
  });
});
