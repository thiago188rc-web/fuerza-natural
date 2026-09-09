import { describe, it, expect } from "vitest";
import {
  primerDiaDeLaSemana,
  ultimoDiaDeLaSemana,
  sumarSemanas,
  primerDiaDelAnio,
  ultimoDiaDelAnio,
} from "@/domain/fechas/calendario";

describe("primerDiaDeLaSemana / ultimoDiaDeLaSemana", () => {
  it("un lunes es el primer día de su propia semana", () => {
    // 2026-09-07 es lunes.
    expect(primerDiaDeLaSemana("2026-09-07")).toBe("2026-09-07");
    expect(ultimoDiaDeLaSemana("2026-09-07")).toBe("2026-09-13");
  });

  it("un domingo pertenece a la semana que empezó el lunes anterior", () => {
    // 2026-09-13 es domingo.
    expect(primerDiaDeLaSemana("2026-09-13")).toBe("2026-09-07");
    expect(ultimoDiaDeLaSemana("2026-09-13")).toBe("2026-09-13");
  });

  it("un miércoles cae en el medio", () => {
    expect(primerDiaDeLaSemana("2026-09-09")).toBe("2026-09-07");
  });

  it("cruza el fin de mes correctamente", () => {
    // 2026-09-01 es martes.
    expect(primerDiaDeLaSemana("2026-09-01")).toBe("2026-08-31");
  });
});

describe("sumarSemanas", () => {
  it("suma y resta semanas completas", () => {
    expect(sumarSemanas("2026-09-07", 1)).toBe("2026-09-14");
    expect(sumarSemanas("2026-09-07", -1)).toBe("2026-08-31");
  });
});

describe("primerDiaDelAnio / ultimoDiaDelAnio", () => {
  it("devuelve los bordes del año civil", () => {
    expect(primerDiaDelAnio("2026-09-07")).toBe("2026-01-01");
    expect(ultimoDiaDelAnio("2026-09-07")).toBe("2026-12-31");
  });
});
