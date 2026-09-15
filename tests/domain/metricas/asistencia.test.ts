import { describe, it, expect } from "vitest";
import { distribucionPorFrecuencia } from "@/domain/metricas/asistencia";

describe("distribucionPorFrecuencia", () => {
  it("promedia el total de visitas sobre las semanas del período", () => {
    // 30 días ≈ 4.29 semanas. 13 visitas / 4.29 ≈ 3.03 → redondea a 3.
    const dist = distribucionPorFrecuencia([13], 30);
    expect(dist).toEqual([{ clave: "3", etiqueta: "3 veces por semana", cantidad: 1, porcentaje: 100 }]);
  });

  it("quien no vino nunca cae en 'No vino', no se excluye del total", () => {
    const dist = distribucionPorFrecuencia([0, 8], 7);
    expect(dist.find((s) => s.clave === "0")?.etiqueta).toBe("No vino");
    expect(dist.reduce((acc, s) => acc + s.cantidad, 0)).toBe(2);
  });

  it("un período de una sola semana no divide de más", () => {
    // 7 días = 1 semana exacta: 4 visitas → 4 veces por semana.
    const dist = distribucionPorFrecuencia([4], 7);
    expect(dist[0].clave).toBe("4");
  });

  it("nunca devuelve una clave fuera de 0..7, aunque venga más de 7 veces por semana", () => {
    const dist = distribucionPorFrecuencia([20], 7); // 20 veces en 7 días
    expect(dist[0].clave).toBe("7");
  });

  it("lista vacía no produce NaN", () => {
    expect(distribucionPorFrecuencia([], 30)).toEqual([]);
  });
});
