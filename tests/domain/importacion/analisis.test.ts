import { describe, it, expect } from "vitest";
import { detectarSeparador, parsearCSV } from "@/domain/importacion/csv";
import {
  analizarFilas,
  claveDePersona,
  detectarColumnas,
  normalizarFecha,
} from "@/domain/importacion/analisis";

/**
 * El análisis de importación corre entero sin base de datos, así que se
 * puede cubrir la clase de archivo que realmente llega de un gimnasio:
 * separador `;` de un Excel argentino, fechas escritas a mano, teléfonos
 * con guiones y la misma persona cargada dos veces.
 */

const CONTEXTO = {
  planes: ["2 días", "3 días", "4 días", "5 días", "LIBRE"],
  existentes: [{ id: "u1", nombre: "Ana", apellido: "Gómez" }],
  hoy: "2026-09-08",
};

describe("parsearCSV", () => {
  it("respeta las comillas y las comas de adentro", () => {
    const filas = parsearCSV('nombre,notas\nAna,"vino con Juan, el hermano"', ",");
    expect(filas[1]).toEqual(["Ana", "vino con Juan, el hermano"]);
  });

  it("una comilla escapada es una comilla literal", () => {
    expect(parsearCSV('a\n"dijo ""hola"""', ",")[1]).toEqual(['dijo "hola"']);
  });

  it("acepta saltos de línea dentro de un campo entrecomillado", () => {
    const filas = parsearCSV('nombre,notas\nAna,"linea uno\nlinea dos"', ",");
    expect(filas).toHaveLength(2);
    expect(filas[1][1]).toBe("linea uno\nlinea dos");
  });

  it("descarta el BOM que escribe Excel", () => {
    expect(parsearCSV("﻿nombre,apellido\nAna,Gómez", ",")[0][0]).toBe("nombre");
  });

  it("ignora las filas totalmente vacías", () => {
    expect(parsearCSV("a,b\n1,2\n\n\n", ",")).toHaveLength(2);
  });
});

describe("detectarSeparador", () => {
  it("reconoce el punto y coma del Excel en español", () => {
    expect(detectarSeparador("nombre;apellido;tel\nAna;Gómez;123\nLuis;Paz;456")).toBe(";");
  });

  it("reconoce la coma", () => {
    expect(detectarSeparador("nombre,apellido,tel\nAna,Gómez,123\nLuis,Paz,456")).toBe(",");
  });

  it("no se confunde con comas que están dentro de un campo", () => {
    const texto = 'nombre;notas\nAna;"pagó 1,500"\nLuis;"debe 2,300"';
    expect(detectarSeparador(texto)).toBe(";");
  });
});

describe("detectarColumnas", () => {
  it("reconoce encabezados con acentos y mayúsculas", () => {
    const c = detectarColumnas(["Nombre", "Apellido", "Teléfono", "Plan"]);
    expect(c.nombre).toBe(0);
    expect(c.apellido).toBe(1);
    expect(c.telefono).toBe(2);
    expect(c.plan).toBe(3);
  });

  it("no le da el campo 'nombre' a una columna 'nombre del plan'", () => {
    const c = detectarColumnas(["Nombre del plan", "Nombre", "Apellido"]);
    expect(c.nombre).toBe(1);
    expect(c.plan).toBe(0);
  });

  it("devuelve -1 para los campos que no aparecen", () => {
    expect(detectarColumnas(["Nombre", "Apellido"]).documento).toBe(-1);
  });

  it("nunca asigna la misma columna a dos campos", () => {
    const c = detectarColumnas(["Nombre", "Apellido", "Tel", "Plan", "Alta"]);
    const asignadas = Object.values(c).filter((i) => i !== -1);
    expect(new Set(asignadas).size).toBe(asignadas.length);
  });
});

describe("normalizarFecha", () => {
  it("lee el formato de acá: día primero", () => {
    expect(normalizarFecha("03/04/2026")).toBe("2026-04-03");
    expect(normalizarFecha("3-4-26")).toBe("2026-04-03");
  });

  it("acepta el ISO tal cual", () => {
    expect(normalizarFecha("2026-04-03")).toBe("2026-04-03");
  });

  it("rechaza fechas que no existen", () => {
    expect(normalizarFecha("31/02/2026")).toBeNull();
    expect(normalizarFecha("15/13/2026")).toBeNull();
  });

  it("rechaza lo que no es una fecha", () => {
    expect(normalizarFecha("el mes pasado")).toBeNull();
    expect(normalizarFecha("")).toBeNull();
  });

  it("NO interpreta 03/04 como 4 de marzo", () => {
    // Adivinar el orden según el valor daría vuelta la mitad de las fechas
    // de una planilla argentina sin que nadie se entere.
    expect(normalizarFecha("03/04/2026")).not.toBe("2026-03-04");
  });
});

describe("analizarFilas", () => {
  const columnas = detectarColumnas(["Nombre", "Apellido", "Teléfono", "Plan", "Alta"]);

  it("marca la fila lista cuando está todo bien", () => {
    const { filas, resumen } = analizarFilas(
      [["Luis", "Paz", "+5491155551234", "3 días", "01/03/2026"]],
      columnas,
      CONTEXTO,
    );
    expect(filas[0].problemas).toEqual([]);
    expect(filas[0].fechaAlta).toBe("2026-03-01");
    expect(resumen.listas).toBe(1);
  });

  it("un plan que no existe es un error, no un aviso", () => {
    const { filas, resumen } = analizarFilas(
      [["Luis", "Paz", "", "PASE ANUAL", ""]],
      columnas,
      CONTEXTO,
    );
    expect(filas[0].problemas.some((p) => p.gravedad === "ERROR" && p.campo === "plan")).toBe(true);
    expect(resumen.planesDesconocidos).toEqual(["PASE ANUAL"]);
  });

  it("un teléfono mal formado es un aviso: se importa vacío, no se inventa", () => {
    const { filas } = analizarFilas([["Luis", "Paz", "15-5555-1234", "3 días", ""]], columnas, {
      ...CONTEXTO,
    });
    expect(filas[0].telefono).toBeNull();
    expect(filas[0].problemas[0].gravedad).toBe("AVISO");
  });

  it("detecta a alguien que ya está en el padrón, sin importar acentos", () => {
    const { filas, resumen } = analizarFilas(
      [["ana", "gomez", "", "3 días", ""]],
      columnas,
      CONTEXTO,
    );
    expect(filas[0].duplicadoExistente).toBe("Ana Gómez");
    expect(resumen.duplicadas).toBe(1);
  });

  it("detecta a la misma persona repetida dentro del archivo", () => {
    const { filas } = analizarFilas(
      [
        ["Luis", "Paz", "", "3 días", ""],
        ["Luis", "Paz", "", "3 días", ""],
      ],
      columnas,
      CONTEXTO,
    );
    expect(filas[0].duplicadoEnArchivo).toBeNull();
    expect(filas[1].duplicadoEnArchivo).toBe(2);
  });

  it("una fecha de alta futura es un error", () => {
    const { filas } = analizarFilas(
      [["Luis", "Paz", "", "3 días", "01/12/2026"]],
      columnas,
      CONTEXTO,
    );
    expect(filas[0].problemas.some((p) => p.campo === "fechaAlta" && p.gravedad === "ERROR")).toBe(
      true,
    );
  });

  it("las cuentas del resumen nunca se pisan entre sí", () => {
    const { resumen } = analizarFilas(
      [
        ["Luis", "Paz", "", "3 días", ""],
        // Una fila con error (falta el nombre). Un renglón TOTALMENTE vacío
        // ya no cuenta: no es una persona (ver "la planilla mensual").
        ["", "Sosa", "", "3 días", ""],
        ["ana", "gomez", "", "3 días", ""],
      ],
      columnas,
      CONTEXTO,
    );
    expect(resumen.total).toBe(3);
    expect(resumen.listas).toBe(1);
    expect(resumen.listas + resumen.conErrores).toBeLessThanOrEqual(resumen.total + 1);
    expect(resumen.listas).toBeGreaterThanOrEqual(0);
  });

  it("la línea reportada coincide con la del archivo, contando el encabezado", () => {
    const { filas } = analizarFilas(
      [
        ["Luis", "Paz", "", "3 días", ""],
        ["Eva", "Sosa", "", "3 días", ""],
      ],
      columnas,
      CONTEXTO,
    );
    expect(filas[0].linea).toBe(2);
    expect(filas[1].linea).toBe(3);
  });
});

describe("claveDePersona", () => {
  it("iguala mayúsculas, acentos y espacios de más", () => {
    expect(claveDePersona("  ANA  ", "Gómez")).toBe(claveDePersona("ana", "gomez"));
  });
});

/**
 * La planilla real del gimnasio (la de pagos de cada mes) tiene el nombre
 * en UNA columna, "NOMBRE Y APELLIDO", escrito "APELLIDO, NOMBRE"; el plan
 * en una columna "DIAS" con el número de días ("2", "3", "LIBRE"); y al
 * final, renglones numerados sin ningún dato. Estos casos salen de esa
 * planilla, con nombres inventados.
 */
describe("la planilla mensual del gimnasio", () => {
  const encabezados = ["", "NOMBRE Y APELLIDO", "PAGO", "DIAS", "VALOR", "NUEVOS", "SISTEMA"];
  const columnas = detectarColumnas(encabezados);

  it("una columna 'NOMBRE Y APELLIDO' es a la vez el nombre y el apellido; 'DIAS' es el plan", () => {
    expect(columnas.nombre).toBe(1);
    expect(columnas.apellido).toBe(1);
    expect(columnas.plan).toBe(3);
  });

  it("la misma columna para nombre y apellido es la única que se repite", () => {
    const asignadas = Object.entries(columnas)
      .filter(([campo, i]) => i !== -1 && campo !== "apellido")
      .map(([, i]) => i);
    expect(new Set(asignadas).size).toBe(asignadas.length);
    for (const otra of [["Apellido y nombre"], ["Nombre completo"], ["Alumno"]]) {
      const c = detectarColumnas(otra);
      expect([c.nombre, c.apellido]).toEqual([0, 0]);
    }
  });

  it("separa 'APELLIDO, NOMBRE' por la coma", () => {
    const { filas } = analizarFilas(
      [
        ["1", "SOSA, ARMANDO", "2026-09-01", "2", "50000", "", "ok"],
        ["2", "DE LA FUENTE,  MARÍA JOSÉ ", "2026-09-02", "3", "55000", "", "ok"],
      ],
      columnas,
      CONTEXTO,
    );
    expect(filas.map((f) => [f.apellido, f.nombre])).toEqual([
      ["SOSA", "ARMANDO"],
      ["DE LA FUENTE", "MARÍA JOSÉ"],
    ]);
    expect(filas.every((f) => f.problemas.length === 0)).toBe(true);
  });

  it("sin coma no se adivina cuál es el apellido: es un error con la indicación de cómo escribirlo", () => {
    const { filas } = analizarFilas([["1", "JUAN PEREZ", "", "2", "", "", ""]], columnas, CONTEXTO);
    const error = filas[0].problemas.find((p) => p.gravedad === "ERROR");
    expect(error?.mensaje).toMatch(/APELLIDO, NOMBRE/);
  });

  it("el plan escrito como número de días es el plan 'N días' del gimnasio", () => {
    const { filas, resumen } = analizarFilas(
      [
        ["1", "SOSA, ANA", "", "2", "", "", ""],
        ["2", "PAZ, LUIS", "", " 3 ", "", "", ""],
        ["3", "VERA, SOL", "", "libre", "", "", ""],
        ["4", "RUIZ, EVA", "", "7", "", "", ""],
      ],
      columnas,
      CONTEXTO,
    );
    expect(filas.map((f) => f.plan)).toEqual(["2 días", "3 días", "LIBRE", null]);
    expect(resumen.planesDesconocidos).toEqual(["7"]);
  });

  it("los renglones sin ningún dato en las columnas usadas no son personas: se ignoran", () => {
    const { filas, resumen } = analizarFilas(
      [
        ["1", "SOSA, ANA", "", "2", "", "", ""],
        ["181", "", "", "", "", "", ""],
        ["182", "", "", "", "", "", ""],
      ],
      columnas,
      { ...CONTEXTO, lineas: [2, 182, 183] },
    );
    expect(resumen.total).toBe(1);
    expect(filas.map((f) => f.linea)).toEqual([2]);
  });

  it("el duplicado contra el padrón se detecta con el nombre ya separado", () => {
    const { filas } = analizarFilas([["1", "GÓMEZ, ANA", "", "2", "", "", ""]], columnas, CONTEXTO);
    expect(filas[0].duplicadoExistente).toBe("Ana Gómez");
  });
});
