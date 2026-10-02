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
    expect(bucketDeEdad("2008-09-06", HOY)).toBe("18_24");
  });

  it("bordes de cada franja (los rangos de Instagram: 18-24, 25-34…)", () => {
    expect(bucketDeEdad("2002-09-07", HOY)).toBe("18_24"); // cumple 24 hoy
    expect(bucketDeEdad("2001-09-07", HOY)).toBe("25_34"); // cumple 25 hoy
    expect(bucketDeEdad("1991-09-08", HOY)).toBe("25_34"); // 34, cumple 35 mañana
    expect(bucketDeEdad("1991-09-07", HOY)).toBe("35_44");
    expect(bucketDeEdad("1981-09-07", HOY)).toBe("45_54");
    expect(bucketDeEdad("1970-01-01", HOY)).toBe("55_64");
    expect(bucketDeEdad("1961-09-08", HOY)).toBe("55_64"); // 64, cumple 65 mañana
    expect(bucketDeEdad("1961-09-07", HOY)).toBe("65_MAS");
  });
});

describe("distribucionPorEdad", () => {
  it("no excluye 'sin dato' del total", () => {
    const alumnos = [
      { fechaNacimiento: null },
      { fechaNacimiento: "2008-09-06" }, // 18_24
      { fechaNacimiento: "2008-09-06" }, // 18_24
    ];
    const dist = distribucionPorEdad(alumnos, HOY);
    const total = dist.reduce((acc, s) => acc + s.cantidad, 0);
    expect(total).toBe(3);
    expect(dist.find((s) => s.clave === "SIN_DATO")?.cantidad).toBe(1);
    expect(dist.find((s) => s.clave === "18_24")?.porcentaje).toBe(67);
  });

  it("lista vacía no produce NaN", () => {
    expect(distribucionPorEdad([], HOY)).toEqual([]);
  });

  it("omite segmentos sin ningún alumno", () => {
    const dist = distribucionPorEdad([{ fechaNacimiento: "2008-09-06" }], HOY);
    expect(dist).toHaveLength(1);
    expect(dist[0].clave).toBe("18_24");
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
      { fechaNacimiento: "2008-09-06", genero: "FEMENINO" }, // 18_24
      { fechaNacimiento: "2008-09-06", genero: "FEMENINO" }, // 18_24
      { fechaNacimiento: "2008-09-06", genero: "MASCULINO" }, // 18_24
      { fechaNacimiento: "1970-01-01", genero: "MASCULINO" }, // 55_64
    ];
    const dist = distribucionPorEdadYGenero(alumnos, HOY);

    const jovenes = dist.find((s) => s.bucket === "18_24");
    expect(jovenes?.total).toBe(3);
    expect(jovenes?.porGenero.find((g) => g.clave === "FEMENINO")?.porcentaje).toBe(67);

    const mayores = dist.find((s) => s.bucket === "55_64");
    expect(mayores?.total).toBe(1);
    expect(mayores?.porGenero.find((g) => g.clave === "MASCULINO")?.porcentaje).toBe(100);
  });

  it("omite rangos etarios sin ningún alumno", () => {
    const dist = distribucionPorEdadYGenero(
      [{ fechaNacimiento: "2008-09-06", genero: "FEMENINO" }],
      HOY,
    );
    expect(dist).toHaveLength(1);
    expect(dist[0].bucket).toBe("18_24");
  });

  it("lista vacía no produce NaN", () => {
    expect(distribucionPorEdadYGenero([], HOY)).toEqual([]);
  });
});
