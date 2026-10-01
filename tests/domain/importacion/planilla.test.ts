import { describe, it, expect } from "vitest";
import { celdaATexto, elegirHoja, hojaATexto, separarEncabezado } from "@/domain/importacion/planilla";

describe("celdaATexto: lo que trae Excel, como texto que el análisis ya entiende", () => {
  it("una celda de fecha se vuelve AAAA-MM-DD, leída en UTC (Excel no guarda zona horaria)", () => {
    expect(celdaATexto(new Date(Date.UTC(2026, 2, 4)))).toBe("2026-03-04");
  });

  it("una fecha con hora no se corre de día", () => {
    expect(celdaATexto(new Date("2025-12-31T23:59:00.000Z"))).toBe("2025-12-31");
  });

  it("un número llega como el texto de la celda: un teléfono no pierde dígitos", () => {
    expect(celdaATexto("5491155551234")).toBe("5491155551234");
    expect(celdaATexto(5491155551234)).toBe("5491155551234");
  });

  it("vacíos y booleanos", () => {
    expect(celdaATexto(null)).toBe("");
    expect(celdaATexto(undefined)).toBe("");
    expect(celdaATexto(true)).toBe("Sí");
    expect(celdaATexto(false)).toBe("No");
  });

  it("una fecha inválida no se convierte en un texto inventado", () => {
    expect(celdaATexto(new Date(Number.NaN))).toBe("");
  });
});

describe("hojaATexto", () => {
  it("convierte cada celda y descarta las filas totalmente vacías, sin perder en qué fila del Excel estaba cada una", () => {
    expect(
      hojaATexto([
        ["Nombre", "Apellido"],
        [null, null],
        ["Ana", null],
        [],
      ]),
    ).toEqual({
      filas: [
        ["Nombre", "Apellido"],
        ["Ana", ""],
      ],
      lineas: [1, 3],
    });
  });
});

describe("separarEncabezado: un título arriba de la tabla no es el encabezado", () => {
  it("si la primera fila es un título, el encabezado es la fila que nombra columnas conocidas", () => {
    const r = separarEncabezado([
      ["Padrón Fuerza Natural 2026", "", "", ""],
      ["Nombre", "Apellido", "Celular", "Plan"],
      ["Ana", "Ruiz", "", "3 días"],
    ]);
    expect(r?.encabezados).toEqual(["Nombre", "Apellido", "Celular", "Plan"]);
    expect(r?.filas).toEqual([["Ana", "Ruiz", "", "3 días"]]);
    expect(r?.lineas).toEqual([3]);
  });

  it("respeta las líneas reales que se le pasan (filas vacías ya descartadas)", () => {
    const r = separarEncabezado(
      [
        ["Padrón 2026"],
        ["nombre", "apellido", "plan"],
        ["Ana", "Ruiz", "3 días"],
        ["Juan", "Gómez", "LIBRE"],
      ],
      [1, 3, 4, 7],
    );
    expect(r?.lineas).toEqual([4, 7]);
  });

  it("con el encabezado en la primera fila, no cambia nada respecto de antes", () => {
    const r = separarEncabezado([
      ["nombre", "apellido", "plan"],
      ["Ana", "Ruiz", "3 días"],
    ]);
    expect(r?.encabezados).toEqual(["nombre", "apellido", "plan"]);
    expect(r?.filas).toHaveLength(1);
  });

  it("si ninguna fila nombra columnas conocidas, el encabezado es la primera fila (después se mapea a mano)", () => {
    const r = separarEncabezado([
      ["col A", "col B"],
      ["x", "y"],
    ]);
    expect(r?.encabezados).toEqual(["col A", "col B"]);
  });

  it("sin filas de datos no hay nada que importar", () => {
    expect(separarEncabezado([["Nombre", "Apellido"]])).toBeNull();
    expect(separarEncabezado([])).toBeNull();
  });
});

describe("elegirHoja", () => {
  it("toma la primera hoja que tiene datos, no la primera a secas", () => {
    expect(
      elegirHoja([
        { nombre: "Portada", filas: [], lineas: [] },
        { nombre: "Datos", filas: [["nombre"], ["Ana"]], lineas: [1, 2] },
      ]),
    ).toBe(1);
  });

  it("si ninguna tiene filas de datos, devuelve -1", () => {
    expect(elegirHoja([{ nombre: "Vacía", filas: [["solo encabezado"]], lineas: [1] }])).toBe(-1);
  });
});
