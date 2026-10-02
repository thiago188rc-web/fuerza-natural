import { describe, it, expect } from "vitest";
import { captacionPorCanal, claveDeCanal, iniciosPorMesDelAnio } from "@/domain/metricas/captacion";

describe("captacionPorCanal", () => {
  it("una persona con dos canales es una porción aparte, no se reparte", () => {
    expect(claveDeCanal(["RECOMENDACION", "VIVE_CERCA"])).toBe("VARIOS");
    expect(claveDeCanal(["REDES_SOCIALES"])).toBe("REDES_SOCIALES");
    expect(claveDeCanal(null)).toBeNull();
    expect(claveDeCanal([])).toBeNull();
  });

  it("los porcentajes suman exactamente 100 y 'sin dato' queda afuera", () => {
    const r = captacionPorCanal([
      { comoConocio: ["RECOMENDACION"] },
      { comoConocio: ["RECOMENDACION"] },
      { comoConocio: ["VIVE_CERCA"] },
      { comoConocio: null },
    ]);
    expect(r.conDato).toBe(3);
    expect(r.sinDato).toBe(1);
    expect(r.segmentos.map((s) => [s.clave, s.cantidad, s.porcentaje])).toEqual([
      ["RECOMENDACION", 2, 67],
      ["VIVE_CERCA", 1, 33],
    ]);
    expect(r.segmentos.reduce((suma, s) => suma + s.porcentaje, 0)).toBe(100);
  });

  it("tres tercios no suman 99", () => {
    const r = captacionPorCanal([
      { comoConocio: ["RECOMENDACION"] },
      { comoConocio: ["VIVE_CERCA"] },
      { comoConocio: ["REDES_SOCIALES"] },
    ]);
    expect(r.segmentos.reduce((suma, s) => suma + s.porcentaje, 0)).toBe(100);
  });

  it("sin nadie con dato no hay porcentajes", () => {
    const r = captacionPorCanal([{ comoConocio: null }]);
    expect(r.segmentos).toEqual([]);
    expect(r.conDato).toBe(0);
  });
});

describe("iniciosPorMesDelAnio", () => {
  it("suma todos los eneros juntos y abre cada mes por canal", () => {
    const r = iniciosPorMesDelAnio([
      { fechaAltaOriginal: "2024-01-10", comoConocio: ["RECOMENDACION"] },
      { fechaAltaOriginal: "2026-01-03", comoConocio: ["RECOMENDACION"] },
      { fechaAltaOriginal: "2025-01-20", comoConocio: null },
      { fechaAltaOriginal: "2025-08-01", comoConocio: ["REDES_SOCIALES"] },
    ]);
    expect(r.total).toBe(4);
    expect(r.desdeAnio).toBe(2024);
    expect(r.hastaAnio).toBe(2026);
    expect(r.meses).toHaveLength(12);
    expect(r.meses[0]).toEqual({
      mes: 1,
      total: 3,
      porCanal: [
        { clave: "RECOMENDACION", cantidad: 2 },
        { clave: "SIN_DATO", cantidad: 1 },
      ],
    });
    expect(r.meses[7].total).toBe(1);
    expect(r.meses[5].total).toBe(0);
  });
});
