import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { leerArchivo, TAMANIO_MAXIMO } from "@/components/features/importacion/leer-archivo";
import { analizarFilas, detectarColumnas } from "@/domain/importacion/analisis";

/**
 * El lector de archivos del importador, con planillas .xlsx reales
 * (tests/fixtures/importacion/, generadas con openpyxl: el mismo formato
 * OOXML que guarda Excel). Corre con la misma librería y el mismo código
 * que el navegador — la entrada `read-excel-file/web-worker` no usa nada
 * que Node no tenga.
 */

const FIXTURES = join(process.cwd(), "tests", "fixtures", "importacion");

function archivo(nombre: string, contenido: BlobPart = readFileSync(join(FIXTURES, nombre))) {
  return new File([contenido], nombre);
}

describe("leer un .xlsx", () => {
  it("lee la primera hoja con datos, salta el título de arriba y la fila vacía del medio", async () => {
    const r = await leerArchivo(archivo("padron.xlsx"));
    if (!r.ok) throw new Error(r.error);

    expect(r.formato).toBe("xlsx");
    expect(r.hojas.map((h) => h.nombre)).toEqual(["Alumnos", "Pagos"]);
    expect(r.hoja).toBe(0);

    const hoja = r.hojas[0]!;
    expect(hoja.encabezados).toEqual([
      "Nombre",
      "Apellido",
      "Celular",
      "Plan",
      "Fecha de alta",
      "DNI",
      "Observaciones",
    ]);
    expect(hoja.filas).toEqual([
      ["Ángela", "Pérez", "5491155551234", "3 días", "2026-03-04", "30123456", "Lesión de rodilla"],
      ["Juan", "Gómez", "+54 9 11 4444-5555", "LIBRE", "15/01/2026", "", ""],
      ["María", "López", "", "2 días", "2025-12-31", "", "Sí"],
    ]);
    // Las filas de Excel donde está cada persona: el título (1) y las
    // filas vacías (2 y 6) no se cuentan como datos, pero sí como filas.
    expect(hoja.lineas).toEqual([4, 5, 7]);
  });

  it("si la primera hoja está vacía, toma la siguiente que tenga datos", async () => {
    const r = await leerArchivo(archivo("primera-hoja-vacia.xlsx"));
    if (!r.ok) throw new Error(r.error);
    expect(r.hojas.map((h) => h.nombre)).toEqual(["Datos"]);
    expect(r.hojas[0]!.filas).toEqual([["Ana", "Ruiz", "4 días"]]);
  });

  it("lo leído alimenta el mismo análisis que un CSV: fechas de Excel entendidas, sin errores inventados", async () => {
    const r = await leerArchivo(archivo("padron.xlsx"));
    if (!r.ok) throw new Error(r.error);
    const hoja = r.hojas[r.hoja]!;
    const { filas } = analizarFilas(hoja.filas, detectarColumnas(hoja.encabezados), {
      planes: ["2 días", "3 días", "LIBRE"],
      existentes: [],
      hoy: "2026-10-01",
      lineas: hoja.lineas,
    });

    expect(filas.map((f) => f.linea)).toEqual([4, 5, 7]);

    expect(filas.map((f) => f.fechaAlta)).toEqual(["2026-03-04", "2026-01-15", "2025-12-31"]);
    expect(filas.map((f) => f.documento)).toEqual(["30123456", null, null]);
    expect(filas[1]!.telefono).toBe("+5491144445555");
    expect(filas.flatMap((f) => f.problemas).filter((p) => p.gravedad === "ERROR")).toEqual([]);
  });
});

describe("el CSV sigue funcionando igual", () => {
  it("separador ; con acentos", async () => {
    const r = await leerArchivo(archivo("alumnos.csv", "nombre;apellido;plan\nAna;Ruiz;3 días\n"));
    if (!r.ok) throw new Error(r.error);
    expect(r.formato).toBe("csv");
    expect(r.separador).toBe(";");
    expect(r.hojas[0]!.encabezados).toEqual(["nombre", "apellido", "plan"]);
    expect(r.hojas[0]!.filas).toEqual([["Ana", "Ruiz", "3 días"]]);
  });
});

describe("archivos que no se pueden leer, con un mensaje que dice qué hacer", () => {
  it("un Excel viejo (.xls) pide guardarlo como .xlsx", async () => {
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    const r = await leerArchivo(archivo("viejo.xls", xls));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/\.xlsx/);
  });

  it("un .xlsx roto no rompe la pantalla", async () => {
    const roto = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);
    const r = await leerArchivo(archivo("roto.xlsx", roto));
    expect(r.ok).toBe(false);
  });

  it("un archivo enorme se rechaza antes de abrirlo", async () => {
    const r = await leerArchivo(archivo("enorme.xlsx", new Uint8Array(TAMANIO_MAXIMO + 1)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/grande/);
  });

  it("una planilla con solo el encabezado avisa que no hay filas", async () => {
    const r = await leerArchivo(archivo("vacio.csv", "nombre;apellido;plan\n"));
    expect(r.ok).toBe(false);
  });
});
