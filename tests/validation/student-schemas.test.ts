import { describe, it, expect } from "vitest";
import {
  cambiarVinculoSchema,
  crearAlumnoSchema,
  editarAlumnoSchema,
  filtrosAlumnosSchema,
} from "@/schemas/student";

/**
 * La validación del borde. Corre siempre en el servidor: el navegador
 * puede tener JavaScript apagado, o alguien puede llamar la Server Action
 * con curl. Estos tests cubren el segundo caso, que es el que importa.
 */

const UUID = "11111111-2222-4333-8444-555555555555";

describe("crearAlumnoSchema", () => {
  it("acepta el alta mínima: nombre, apellido y plan", () => {
    const r = crearAlumnoSchema.safeParse({ nombre: "Ana", apellido: "Gómez", planId: UUID });
    expect(r.success).toBe(true);
  });

  it("normaliza espacios de más en nombre y apellido", () => {
    const r = crearAlumnoSchema.safeParse({
      nombre: "  Ana   María ",
      apellido: " Gómez ",
      planId: UUID,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nombre).toBe("Ana María");
      expect(r.data.apellido).toBe("Gómez");
    }
  });

  it("rechaza nombre vacío con un mensaje en español", () => {
    const r = crearAlumnoSchema.safeParse({ nombre: "   ", apellido: "Gómez", planId: UUID });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("El nombre es obligatorio.");
  });

  it("el teléfono es OPCIONAL: un campo vacío del formulario no es un error", () => {
    const r = crearAlumnoSchema.safeParse({
      nombre: "Ana",
      apellido: "Gómez",
      planId: UUID,
      telefono: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.telefono).toBeUndefined();
  });

  it("si el teléfono viene, se normaliza y se exige E.164", () => {
    const r = crearAlumnoSchema.safeParse({
      nombre: "Ana",
      apellido: "Gómez",
      planId: UUID,
      telefono: "+54 9 (11) 5555-1234",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.telefono).toBe("+5491155551234");
  });

  it("rechaza un teléfono sin prefijo internacional", () => {
    const r = crearAlumnoSchema.safeParse({
      nombre: "Ana",
      apellido: "Gómez",
      planId: UUID,
      telefono: "1155551234",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un plan que no es un uuid", () => {
    const r = crearAlumnoSchema.safeParse({ nombre: "Ana", apellido: "Gómez", planId: "3 días" });
    expect(r.success).toBe(false);
  });

  it("NO acepta gymId: el tenant sale de la sesión, nunca del cliente", () => {
    const r = crearAlumnoSchema.safeParse({
      nombre: "Ana",
      apellido: "Gómez",
      planId: UUID,
      gymId: "00000000-0000-0000-0000-000000000009",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty("gymId");
  });

  it("NO acepta vinculo: el estado inicial de un alta es siempre ACTIVO", () => {
    const r = crearAlumnoSchema.safeParse({
      nombre: "Ana",
      apellido: "Gómez",
      planId: UUID,
      vinculo: "BAJA",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty("vinculo");
  });

  it("rechaza un nombre de más de 80 caracteres", () => {
    const r = crearAlumnoSchema.safeParse({
      nombre: "a".repeat(81),
      apellido: "Gómez",
      planId: UUID,
    });
    expect(r.success).toBe(false);
  });
});

describe("editarAlumnoSchema", () => {
  it("exige id y fecha de alta", () => {
    const r = editarAlumnoSchema.safeParse({ nombre: "Ana", apellido: "Gómez", planId: UUID });
    expect(r.success).toBe(false);
  });

  it("acepta una edición completa", () => {
    const r = editarAlumnoSchema.safeParse({
      id: UUID,
      nombre: "Ana",
      apellido: "Gómez",
      planId: UUID,
      fechaAltaOriginal: "2026-01-10",
      telefono: "",
      notas: "",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza una fecha con formato inválido", () => {
    const r = editarAlumnoSchema.safeParse({
      id: UUID,
      nombre: "Ana",
      apellido: "Gómez",
      planId: UUID,
      fechaAltaOriginal: "10/01/2026",
    });
    expect(r.success).toBe(false);
  });
});

describe("cambiarVinculoSchema", () => {
  it("acepta los tres estados válidos", () => {
    for (const vinculo of ["ACTIVO", "PAUSADO", "BAJA"]) {
      expect(cambiarVinculoSchema.safeParse({ id: UUID, vinculo }).success).toBe(true);
    }
  });

  it("rechaza un estado inventado", () => {
    const r = cambiarVinculoSchema.safeParse({ id: UUID, vinculo: "MOROSO" });
    expect(r.success).toBe(false);
  });

  it("rechaza los estados de PAGO: no existen como estado del vínculo", () => {
    for (const inventado of ["MOROSO", "VENCIDO", "PERDIDO", "INACTIVO"]) {
      expect(cambiarVinculoSchema.safeParse({ id: UUID, vinculo: inventado }).success).toBe(false);
    }
  });
});

describe("filtrosAlumnosSchema", () => {
  it("valores por defecto cuando la URL no trae nada", () => {
    const r = filtrosAlumnosSchema.parse({});
    expect(r).toEqual({ q: undefined, estado: "TODOS", pagina: 1 });
  });

  it("una URL manipulada no rompe la pantalla: cae a los valores por defecto", () => {
    const r = filtrosAlumnosSchema.parse({ estado: "BASURA", pagina: "-5" });
    expect(r.estado).toBe("TODOS");
    expect(r.pagina).toBe(1);
  });

  it("respeta un filtro y una página válidos", () => {
    const r = filtrosAlumnosSchema.parse({ q: " gomez ", estado: "PAUSADO", pagina: "3" });
    expect(r).toEqual({ q: "gomez", estado: "PAUSADO", pagina: 3 });
  });
});
