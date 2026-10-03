import { describe, it, expect } from "vitest";
import { claveDeIntento, ipDelPedido, LIMITES } from "@/lib/auth/limite-de-intentos";

describe("claveDeIntento", () => {
  it("es un SHA-256: no deja el email ni la IP en claro", () => {
    const clave = claveDeIntento("login", "203.0.113.7", "ana@ejemplo.test");
    expect(clave).toMatch(/^[0-9a-f]{64}$/);
    expect(clave).not.toContain("ana");
    expect(clave).not.toContain("203.0.113.7");
  });

  it("no la esquiva cambiando mayúsculas o espacios del email", () => {
    expect(claveDeIntento("login", "203.0.113.7", " Ana@Ejemplo.TEST ")).toBe(
      claveDeIntento("login", "203.0.113.7", "ana@ejemplo.test"),
    );
  });

  it("cuentas, IPs y tipos distintos son contadores distintos", () => {
    const base = claveDeIntento("login", "203.0.113.7", "ana@ejemplo.test");
    expect(claveDeIntento("login", "203.0.113.8", "ana@ejemplo.test")).not.toBe(base);
    expect(claveDeIntento("login", "203.0.113.7", "eva@ejemplo.test")).not.toBe(base);
    expect(claveDeIntento("login-ip", "203.0.113.7")).not.toBe(claveDeIntento("recuperar", "203.0.113.7"));
  });
});

describe("ipDelPedido", () => {
  const encabezados = (h: Record<string, string>) => new Headers(h);

  it("prefiere x-real-ip, y si no, la primera de x-forwarded-for", () => {
    expect(ipDelPedido(encabezados({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe(
      "203.0.113.7",
    );
    expect(ipDelPedido(encabezados({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
  });

  it("sin encabezados (desarrollo local) cae en un balde común", () => {
    expect(ipDelPedido(encabezados({}))).toBe("sin-ip");
  });
});

describe("LIMITES", () => {
  it("el login por cuenta es más estricto que el login por IP", () => {
    expect(LIMITES.loginPorCuenta.maximo).toBeLessThan(LIMITES.loginPorIp.maximo);
    for (const limite of Object.values(LIMITES)) {
      expect(limite.maximo).toBeGreaterThan(0);
      expect(limite.ventanaSegundos).toBeGreaterThan(0);
    }
  });
});
