import { describe, it, expect } from "vitest";
import { construirPlan, type OpcionesDelPlan } from "../../scripts/migracion/plan";
import { emparejar, separarDeBase } from "../../scripts/migracion/emparejar";
import { corregirAnio, type PagoDePlanilla, type PersonaDeBase } from "../../scripts/migracion/planillas";

/**
 * La migración desde las planillas, con datos INVENTADOS (nunca los del
 * gimnasio real): cómo se arma la historia de cada alumno a partir de la
 * planilla de cuotas, igual que la cuenta el dueño.
 */

const opciones: OpcionesDelPlan = {
  anio: 2026,
  mesDelPadron: "2026-09-01",
  mesEnCurso: "2026-10-01",
  hoy: "2026-10-02",
  planes: new Map([
    ["2 días", { dias: 2 }],
    ["3 días", { dias: 3 }],
    ["LIBRE", { dias: 5 }],
  ]),
  planPorDefecto: "2 días",
};

function persona(completo: string, inicio: string | null, extra: Partial<PersonaDeBase> = {}): PersonaDeBase {
  return {
    hoja: "A-B",
    linea: 3,
    completo,
    dni: "30111222",
    nacimiento: { dia: "5", mes: "6", anio: "1990" },
    direccion: "CALLE 1",
    telefono: "2804000000",
    comoConocio: "RECOMENDACIÓN",
    inicio: { iso: inicio, crudo: inicio ?? "" },
    ...extra,
  };
}

let linea = 1;
function pago(nombre: string, mes: number, dia = 5, extra: Partial<PagoDePlanilla> = {}): PagoDePlanilla {
  const mm = String(mes).padStart(2, "0");
  return {
    hoja: `M${mm}`,
    linea: linea++,
    mesDeHoja: `2026-${mm}-01`,
    nombre,
    fecha: `2026-${mm}-${String(dia).padStart(2, "0")}`,
    fechaCruda: "",
    dias: "3",
    valor: "50000",
    nuevos: "",
    ...extra,
  };
}

describe("construirPlan", () => {
  it("dejó en abril y volvió en junio: BAJA el 1/4 y vuelta el día que pagó", () => {
    const base = [persona("PEREZ, ANA", "2025-03-01")];
    const pagos = [1, 2, 3, 6, 7, 8, 9].map((m) => pago("PEREZ, ANA", m));
    const plan = construirPlan(base, pagos, new Map(), opciones);
    const [a] = plan.alumnos;
    expect(a.vinculo).toBe("ACTIVO");
    expect(a.eventos).toEqual([
      { tipo: "ALTA", fecha: "2025-03-01" },
      { tipo: "BAJA", fecha: "2026-04-01" },
      { tipo: "REACTIVACION", fecha: "2026-06-05" },
    ]);
    expect(a.vinculoDesde).toBe("2026-06-05");
    expect(a.pagos).toHaveLength(7);
  });

  it("pagó hasta julio: queda de baja desde agosto, con la observación", () => {
    const plan = construirPlan(
      [persona("GOMEZ, LUIS", "2024-02-01")],
      [1, 2, 3, 4, 5, 6, 7].map((m) => pago("GOMEZ, LUIS", m)),
      new Map(),
      opciones,
    );
    const [a] = plan.alumnos;
    expect(a.vinculo).toBe("BAJA");
    expect(a.bajaFecha).toBe("2026-08-01");
    expect(a.bajaObservacion).toMatch(/Dejó de pagar/);
  });

  it("en la base pero sin pagos en 2026: baja anterior al control, sin inventar la fecha", () => {
    const plan = construirPlan([persona("DIAZ, EVA", "2023-05-10")], [], new Map(), opciones);
    const [a] = plan.alumnos;
    expect(a.vinculo).toBe("BAJA");
    expect(a.bajaFecha).toBe("2025-12-31");
    expect(a.bajaObservacion).toMatch(/fecha exacta desconocida/);
    expect(a.eventos.filter((e) => e.tipo === "BAJA")).toHaveLength(0);
    expect(a.planPorDefecto).toBe(true);
    expect(a.notas).toMatch(/Plan sin dato/);
  });

  it("figurar en la hoja de septiembre es estar en el padrón, aunque el renglón sea un recordatorio", () => {
    const pagos = [
      pago("ROJAS, ALMA", 8),
      // Recordatorio en la hoja de septiembre con la fecha de agosto.
      { ...pago("ROJAS, ALMA", 9), fecha: "2026-08-28" },
    ];
    const [a] = construirPlan([persona("ROJAS, ALMA", "2026-08-03")], pagos, new Map(), opciones).alumnos;
    expect(a.vinculo).toBe("ACTIVO");
    expect(a.pagos).toHaveLength(1);
    expect(a.eventos.some((e) => e.tipo === "BAJA")).toBe(false);
  });

  it("la hoja de octubre arrastra el listado de septiembre: esas filas no son pagos", () => {
    const pagos = [pago("SOSA, IVO", 9), { ...pago("SOSA, IVO", 10), fecha: "2026-09-05" }];
    const plan = construirPlan([persona("SOSA, IVO", "2025-01-01")], pagos, new Map(), opciones);
    expect(plan.alumnos[0].pagos).toHaveLength(1);
    expect(plan.descartados.some((d) => d.includes("fuera del mes"))).toBe(true);
  });

  it("los renglones sin fecha son notas del dueño, no personas", () => {
    const pagos = [{ ...pago("PAGAN CERCA DEL 15", 3), fecha: null }];
    const plan = construirPlan([], pagos, new Map(), opciones);
    expect(plan.alumnos).toHaveLength(0);
    expect(plan.descartados).toHaveLength(1);
  });

  it("1/2 MES: modalidad medio mes desde la fecha de pago, y si cruza el mes, dos tramos", () => {
    const pagos = [pago("LUNA, SOL", 9), pago("LUNA, SOL", 9, 25, { dias: "1/2 MES", valor: "45000" })];
    const [a] = construirPlan([persona("LUNA, SOL", "2025-01-01")], pagos, new Map(), opciones).alumnos;
    const medio = a.pagos.find((p) => p.modalidad === "MEDIO_MES")!;
    expect(medio.tramos).toEqual([
      { periodo: "2026-09-01", cubreDesde: "2026-09-25", cubreHasta: "2026-09-30" },
      { periodo: "2026-10-01", cubreDesde: "2026-10-01", cubreHasta: "2026-10-09" },
    ]);
    expect(medio.planNombre).toBe("3 días");
  });

  it("'5O000' con la letra O es un tipeo real: se lee como 50000", () => {
    const [a] = construirPlan(
      [persona("MORA, JUAN", "2025-01-01")],
      [pago("MORA, JUAN", 9, 7, { valor: "5O000" })],
      new Map(),
      opciones,
    ).alumnos;
    expect(a.pagos[0].monto).toBe(50000);
  });

  it("los datos de la base pasan normalizados (teléfono, DNI, canal, nacimiento)", () => {
    const [a] = construirPlan(
      [persona("PAZ, LIA", "2025-01-01", { dni: "30.123.456", telefono: "2804001234" })],
      [pago("PAZ, LIA", 9)],
      new Map(),
      opciones,
    ).alumnos;
    expect(a.telefono).toBe("+5492804001234");
    expect(a.documento).toBe("30123456");
    expect(a.comoConocio).toEqual(["RECOMENDACION"]);
    expect(a.fechaNacimiento).toBe("1990-06-05");
  });

  it("un pago a nombre de alguien que no está en la base crea a esa persona", () => {
    const plan = construirPlan([], [pago("NUEVO, TOMAS", 9, 14)], new Map(), opciones);
    expect(plan.alumnos).toHaveLength(1);
    expect(plan.alumnos[0]).toMatchObject({ fuente: "CUOTAS", apellido: "NUEVO", nombre: "TOMAS", fechaAltaOriginal: "2026-09-14" });
  });
});

describe("emparejar", () => {
  const base = ["ROMERO, FEDERICO", "ROMERO, IVAN", "BALMACEDA, RODRIGO", "QUIROZ, CARLOS", "SALAS, MARIA EUGENIA", "IRIARTE, EMMA"];
  const buscar = (nombre: string) => {
    const e = emparejar(nombre, base, separarDeBase);
    return e.tipo === "UNICO" ? e.persona : e.tipo;
  };

  it("apodos, tipeos y nombre al revés", () => {
    expect(buscar("ROMERO, FEDE")).toBe("ROMERO, FEDERICO");
    expect(buscar("BALMACEA, RODRIGO")).toBe("BALMACEDA, RODRIGO");
    expect(buscar("CARLOS QUIROZ")).toBe("QUIROZ, CARLOS");
    expect(buscar("CARLOS, QUIROZ")).toBe("QUIROZ, CARLOS");
    expect(buscar("SALAS, EUGENIA")).toBe("SALAS, MARIA EUGENIA");
    expect(buscar("IRIARTE, EMA")).toBe("IRIARTE, EMMA");
  });

  it("no confunde a dos hermanos ni inventa una pareja", () => {
    expect(buscar("ROMERO, IVAN")).toBe("ROMERO, IVAN");
    expect(buscar("ROMERO, NORA")).toBe("NINGUNO");
  });
});

describe("corregirAnio", () => {
  it("'1-Jan' tipeado en diciembre queda en el año anterior: se corrige solo ese caso", () => {
    expect(corregirAnio("2025-01-01", "2026-01-01")).toBe("2026-01-01");
    expect(corregirAnio("2026-01-05", "2026-01-01")).toBe("2026-01-05");
    expect(corregirAnio("2025-12-28", "2026-01-01")).toBe("2025-12-28");
  });
});
