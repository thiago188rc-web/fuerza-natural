import { describe, it, expect } from "vitest";
import { hoyISO } from "@/domain/fechas/hoy";

/**
 * hoyISO() es la única función del dominio autorizada a tocar
 * `Date`/`Intl` (ver src/domain/fechas/hoy.ts). Estos tests fijan
 * `ahoraUTC` explícitamente — nunca dependen del reloj real — para que
 * sean deterministas y repetibles en cualquier CI, sin importar en qué
 * TZ corra el proceso de Node.
 */
describe("hoyISO()", () => {
  it("devuelve el día civil en 'America/Argentina/Buenos_Aires' para una fecha UTC fija", () => {
    // 2026-06-15T18:00:00Z → mismo día en UTC-3 (15:00 en Buenos Aires).
    const ahoraUTC = new Date("2026-06-15T18:00:00.000Z");
    expect(hoyISO("America/Argentina/Buenos_Aires", ahoraUTC)).toBe("2026-06-15");
  });

  it("cruza la medianoche: UTC y Buenos Aires (UTC-3) caen en días distintos", () => {
    // 2026-06-15T02:00:00Z son las 23:00 del 2026-06-14 en Buenos Aires
    // (UTC-3, sin horario de verano). Este es exactamente el caso que
    // justifica esta función en vez de `new Date().toISOString().slice(0,10)`:
    // ese atajo devolvería "2026-06-15", un día adelantado para el
    // gimnasio, lo cual registraría un pago o un alta con la fecha
    // equivocada.
    const ahoraUTC = new Date("2026-06-15T02:00:00.000Z");
    expect(hoyISO("America/Argentina/Buenos_Aires", ahoraUTC)).toBe("2026-06-14");

    // El "atajo prohibido" en efecto da un resultado distinto — confirma
    // que el caso de prueba realmente ejercita la diferencia de TZ.
    expect(ahoraUTC.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("con otra timezone ('America/Mexico_City') el resultado cambia según el parámetro", () => {
    // Mismo instante UTC que el caso anterior, pero Ciudad de México es
    // UTC-6: 2026-06-15T02:00:00Z son las 20:00 del 2026-06-14 ahí
    // también, así que probamos un instante donde Buenos Aires y Ciudad
    // de México caen en días DISTINTOS entre sí para aislar el efecto
    // real del parámetro `timezone`.
    const ahoraUTC = new Date("2026-06-15T04:30:00.000Z");
    // Buenos Aires (UTC-3): 01:30 del 2026-06-15.
    expect(hoyISO("America/Argentina/Buenos_Aires", ahoraUTC)).toBe("2026-06-15");
    // Ciudad de México (UTC-6, sin horario de verano desde 2022): 22:30
    // del 2026-06-14 — un día distinto al de Buenos Aires para el mismo
    // instante.
    expect(hoyISO("America/Mexico_City", ahoraUTC)).toBe("2026-06-14");
  });
});
