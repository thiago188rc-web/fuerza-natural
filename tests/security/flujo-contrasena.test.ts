import { describe, it, expect, afterEach } from "vitest";
import {
  destinoSeguro,
  exigeContrasenaActual,
  mensajeDeErrorAlCambiar,
  MENSAJES_CONTRASENA,
} from "@/lib/auth/flujo-contrasena";
import { cambiarContrasenaSchema, pedirRecuperacionSchema } from "@/schemas/cuenta";
import { esRutaPublica } from "@/lib/auth/rutas-publicas";
import { OPCIONES_COOKIE_DE_SESION, urlDeLaApp } from "@/lib/auth/config";

const AHORA = 1_790_000_000;

describe("exigeContrasenaActual", () => {
  it("una sesión normal (contraseña) siempre la pide", () => {
    expect(exigeContrasenaActual([{ method: "password", timestamp: AHORA - 10 }], AHORA)).toBe(true);
  });

  it("una sesión abierta con el enlace de recuperación hace menos de 15 minutos, no", () => {
    expect(exigeContrasenaActual([{ method: "recovery", timestamp: AHORA - 60 }], AHORA)).toBe(false);
    expect(exigeContrasenaActual([{ method: "otp", timestamp: AHORA - 14 * 60 }], AHORA)).toBe(false);
  });

  it("pasados los 15 minutos, la recuperación ya no alcanza", () => {
    expect(exigeContrasenaActual([{ method: "recovery", timestamp: AHORA - 16 * 60 }], AHORA)).toBe(true);
  });

  it("ante un AMR raro o ausente, la pide (falla cerrado)", () => {
    for (const amr of [undefined, null, "recovery", ["recovery"], [{ method: "recovery" }], {}]) {
      expect(exigeContrasenaActual(amr, AHORA), JSON.stringify(amr)).toBe(true);
    }
  });
});

describe("destinoSeguro", () => {
  it("solo deja volver a la pantalla de contraseña: nada que venga de afuera", () => {
    expect(destinoSeguro("/cuenta/contrasena")).toBe("/cuenta/contrasena");
    for (const malo of ["https://evil.example", "//evil.example", "/dashboard", "/cuenta/contrasena/../x", null, ""]) {
      expect(destinoSeguro(malo), String(malo)).toBe("/cuenta/contrasena");
    }
  });
});

describe("mensajeDeErrorAlCambiar", () => {
  it("traduce lo que el usuario puede resolver, y no inventa el resto", () => {
    expect(mensajeDeErrorAlCambiar("weak_password")).toBe(MENSAJES_CONTRASENA.debil);
    expect(mensajeDeErrorAlCambiar("same_password")).toBe(MENSAJES_CONTRASENA.igual);
    expect(mensajeDeErrorAlCambiar("reauthentication_needed")).toBe(MENSAJES_CONTRASENA.reautenticar);
    expect(mensajeDeErrorAlCambiar("algo_nuevo")).toMatch(/No pudimos cambiar/);
  });
});

describe("cambiarContrasenaSchema", () => {
  it("exige 10 caracteres y que las dos coincidan", () => {
    expect(cambiarContrasenaSchema.safeParse({ nueva: "corta", repetida: "corta" }).success).toBe(false);
    const distintas = cambiarContrasenaSchema.safeParse({ nueva: "una-frase-larga", repetida: "otra-frase-larga" });
    expect(distintas.success).toBe(false);
    if (!distintas.success) expect(distintas.error.issues[0].path).toEqual(["repetida"]);
    expect(cambiarContrasenaSchema.safeParse({ nueva: "una-frase-larga", repetida: "una-frase-larga" }).success).toBe(
      true,
    );
  });

  it("rechaza más de 72 caracteres (bcrypt ignoraría el resto)", () => {
    const larga = "x".repeat(73);
    expect(cambiarContrasenaSchema.safeParse({ nueva: larga, repetida: larga }).success).toBe(false);
  });
});

describe("pedirRecuperacionSchema", () => {
  it("normaliza el email y rechaza lo que no es uno", () => {
    const r = pedirRecuperacionSchema.safeParse({ email: "  Ana@Ejemplo.TEST " });
    expect(r.success && r.data.email).toBe("ana@ejemplo.test");
    expect(pedirRecuperacionSchema.safeParse({ email: "no-es-un-email" }).success).toBe(false);
  });
});

describe("rutas públicas", () => {
  it("el login, la recuperación, el enlace y el health check se ven sin sesión", () => {
    for (const ruta of ["/login", "/recuperar", "/auth/confirm", "/api/salud"]) expect(esRutaPublica(ruta), ruta).toBe(true);
  });

  it("todo lo demás no, aunque empiece parecido", () => {
    for (const ruta of ["/", "/dashboard", "/alumnos", "/login-falso", "/recuperarlo", "/api/otra", "/cuenta/contrasena"]) {
      expect(esRutaPublica(ruta), ruta).toBe(false);
    }
  });
});

describe("cookies de sesión y URL de la app", () => {
  const appUrl = process.env.APP_URL;
  afterEach(() => {
    if (appUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = appUrl;
  });

  it("la cookie de sesión no es legible desde JavaScript", () => {
    expect(OPCIONES_COOKIE_DE_SESION.httpOnly).toBe(true);
    expect(OPCIONES_COOKIE_DE_SESION.sameSite).toBe("lax");
  });

  it("APP_URL manda; si no, el origen del pedido; nunca http fuera de localhost", () => {
    process.env.APP_URL = "https://fuerza.example";
    expect(urlDeLaApp("https://otro.example")).toBe("https://fuerza.example");
    delete process.env.APP_URL;
    expect(urlDeLaApp("https://fuerza.example")).toBe("https://fuerza.example");
    expect(urlDeLaApp("http://evil.example")).toBe("http://localhost:3000");
    expect(urlDeLaApp(null)).toBe("http://localhost:3000");
  });
});
