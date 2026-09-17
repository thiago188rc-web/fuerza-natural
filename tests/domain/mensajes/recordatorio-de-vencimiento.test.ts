import { describe, it, expect } from "vitest";
import { mensajeRecordatorioDeVencimiento } from "@/lib/mensajes-whatsapp";

/**
 * Los dos recordatorios son texto que el gimnasio le manda a una persona
 * real. Lo que fijan estos tests no es la redacción palabra por palabra
 * —eso el dueño lo cambia cuando quiere— sino las dos decisiones que no
 * deben perderse al editarlos:
 *
 *   1. Ámbar y rojo NO dicen lo mismo. Ámbar recuerda la cuota; rojo
 *      pregunta si sigue viniendo, porque a esa altura lo que el gimnasio
 *      necesita saber es si libera el lugar.
 *   2. Ninguno inventa un monto ni una fecha límite.
 */

const BASE = { nombre: "Camila", planNombre: "3 días" };

describe("recordatorio ámbar (REVISAR)", () => {
  it("nombra el plan y hace cuántos días venció", () => {
    const texto = mensajeRecordatorioDeVencimiento({ ...BASE, estado: "REVISAR", diasVencido: 3 });
    expect(texto).toContain("Camila");
    expect(texto).toContain("3 días");
    expect(texto).toContain("hace 3 días");
  });

  it("singulariza un solo día", () => {
    const texto = mensajeRecordatorioDeVencimiento({ ...BASE, estado: "REVISAR", diasVencido: 1 });
    expect(texto).toContain("hace 1 día");
    expect(texto).not.toContain("hace 1 días");
  });

  it("sin dato de días no inventa el plazo", () => {
    const texto = mensajeRecordatorioDeVencimiento({
      ...BASE,
      estado: "REVISAR",
      diasVencido: null,
    });
    expect(texto).not.toContain("hace");
    expect(texto).toContain("Camila");
  });
});

describe("recordatorio rojo (DESCUBIERTO)", () => {
  const texto = mensajeRecordatorioDeVencimiento({
    ...BASE,
    estado: "DESCUBIERTO",
    diasVencido: 12,
  });

  it("saluda por el nombre", () => {
    expect(texto.startsWith("Hola Camila")).toBe(true);
  });

  it("pregunta si va a seguir viniendo, que es el punto del mensaje", () => {
    expect(texto).toContain("si vas a continuar viniendo");
    expect(texto).toContain("dar el espacio a otra persona");
  });

  it("no menciona monto, plan ni cantidad de días vencidos", () => {
    expect(texto).not.toContain("3 días");
    expect(texto).not.toContain("12");
    expect(texto).not.toMatch(/\$/);
  });

  it("conserva los saltos de línea del texto dictado por el dueño", () => {
    expect(texto.split("\n\n")).toHaveLength(4);
  });
});

describe("los dos tonos son distintos", () => {
  it("ámbar y rojo no mandan el mismo texto", () => {
    const ambar = mensajeRecordatorioDeVencimiento({ ...BASE, estado: "REVISAR", diasVencido: 2 });
    const rojo = mensajeRecordatorioDeVencimiento({
      ...BASE,
      estado: "DESCUBIERTO",
      diasVencido: 2,
    });
    expect(ambar).not.toBe(rojo);
  });
});
