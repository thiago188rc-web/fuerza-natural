import { describe, it, expect } from "vitest";
import { activosAlFinDeCadaMes } from "@/domain/metricas/roster";

describe("activosAlFinDeCadaMes", () => {
  const alumnos = [
    { fechaAltaOriginal: "2026-07-29", bajaFecha: null },
    { fechaAltaOriginal: "2026-08-05", bajaFecha: null },
    { fechaAltaOriginal: "2026-08-10", bajaFecha: "2026-09-01" },
  ];

  it("cuenta a quien ya entró y todavía no se fue", () => {
    const [ago] = activosAlFinDeCadaMes(alumnos, ["2026-08-31"]);
    // Los tres ya habían entrado para fin de agosto, y nadie se había ido todavía.
    expect(ago.cantidad).toBe(3);
  });

  it("a quien se dio de baja deja de contarse desde el mes siguiente", () => {
    const [sept] = activosAlFinDeCadaMes(alumnos, ["2026-09-30"]);
    expect(sept.cantidad).toBe(2);
  });

  it("el mismo día de la baja todavía cuenta (bajaFecha > finDeMes falla, no se resta antes de tiempo)", () => {
    // bajaFecha = 2026-09-01: para fin de agosto (2026-08-31) esa persona seguía activa.
    const [ago] = activosAlFinDeCadaMes(alumnos, ["2026-08-31"]);
    expect(ago.cantidad).toBe(3);
  });

  it("marca 'real: false' un mes anterior a la alta más vieja que hay en el sistema", () => {
    const [marzo] = activosAlFinDeCadaMes(alumnos, ["2026-03-31"]);
    expect(marzo.real).toBe(false);
    expect(marzo.cantidad).toBe(0);
  });

  it("marca 'real: true' desde el mes de la alta más vieja en adelante", () => {
    const [julio] = activosAlFinDeCadaMes(alumnos, ["2026-07-31"]);
    expect(julio.real).toBe(true);
  });

  it("con una lista vacía, todos los meses quedan sin dato real", () => {
    const resultado = activosAlFinDeCadaMes([], ["2026-08-31"]);
    expect(resultado[0].real).toBe(false);
    expect(resultado[0].cantidad).toBe(0);
  });
});
