import { describe, it, expect } from "vitest";
import {
  primerDiaDeLaSemana,
  ultimoDiaDeLaSemana,
  sumarSemanas,
  primerDiaDelAnio,
  ultimoDiaDelAnio,
  inicialDelDia,
  sumarDias,
} from "@/domain/fechas/calendario";

describe("inicialDelDia", () => {
  it("una semana completa arranca en L y termina en D", () => {
    // 2026-09-07 es lunes.
    const semana = Array.from({ length: 7 }, (_, i) => inicialDelDia(sumarDias("2026-09-07", i)));
    expect(semana).toEqual(["L", "M", "M", "J", "V", "S", "D"]);
  });

  it("es la misma inicial en cualquier semana del año", () => {
    // 2026-01-05 y 2026-12-28 también son lunes.
    expect(inicialDelDia("2026-01-05")).toBe("L");
    expect(inicialDelDia("2026-12-28")).toBe("L");
    expect(inicialDelDia("2026-01-11")).toBe("D");
  });
});

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
