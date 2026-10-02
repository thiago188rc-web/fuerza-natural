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

describe("activosAlFinDeCadaMes con bajas y vueltas registradas", () => {
  // Se fue en abril y volvió en junio: hoy no tiene `bajaFecha` (reactivar
  // la limpia), pero en abril y mayo no venía.
  const ida_y_vuelta = {
    fechaAltaOriginal: "2025-03-10",
    bajaFecha: null,
    cambios: [
      { tipo: "REACTIVACION" as const, fecha: "2026-06-05" },
      { tipo: "BAJA" as const, fecha: "2026-04-01" },
    ],
  };

  it("no lo cuenta en los meses en que estaba de baja", () => {
    const [marzo, abril, mayo, junio] = activosAlFinDeCadaMes(
      [ida_y_vuelta],
      ["2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"],
    );
    expect([marzo.cantidad, abril.cantidad, mayo.cantidad, junio.cantidad]).toEqual([1, 0, 0, 1]);
  });

  it("si lo primero registrado es una vuelta, antes no estaba (se fue sin que quede la fecha)", () => {
    const volvio = {
      fechaAltaOriginal: "2023-01-01",
      bajaFecha: null,
      cambios: [{ tipo: "REACTIVACION" as const, fecha: "2026-05-03" }],
    };
    const [abril, mayo] = activosAlFinDeCadaMes([volvio], ["2026-04-30", "2026-05-31"]);
    expect([abril.cantidad, mayo.cantidad]).toEqual([0, 1]);
  });

  it("sin cambios registrados sigue mandando bajaFecha", () => {
    const [ene] = activosAlFinDeCadaMes(
      [{ fechaAltaOriginal: "2024-01-01", bajaFecha: "2025-12-31", cambios: [] }],
      ["2026-01-31"],
    );
    expect(ene.cantidad).toBe(0);
  });
});
