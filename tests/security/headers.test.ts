import { describe, it, expect } from "vitest";
import { buildCsp, SECURITY_HEADERS } from "@/lib/security/headers";

describe("buildCsp()", () => {
  const nonce = "test-nonce-abc123";
  const csp = buildCsp(nonce, "https://example.supabase.co");

  it("incluye 'strict-dynamic' en script-src", () => {
    expect(csp).toContain("strict-dynamic");
  });

  it("script-src no contiene 'unsafe-inline' ni 'unsafe-eval'", () => {
    const scriptSrcDirective = csp.split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrcDirective).toBeDefined();
    expect(scriptSrcDirective).not.toContain("unsafe-inline");
    expect(scriptSrcDirective).not.toContain("unsafe-eval");
  });

  it("el nonce pasado aparece en el resultado", () => {
    expect(csp).toContain(`'nonce-${nonce}'`);
  });

  it("incluye la URL de Supabase en connect-src cuando se provee", () => {
    const connectSrcDirective = csp.split(";").find((d) => d.trim().startsWith("connect-src"));
    expect(connectSrcDirective).toContain("https://example.supabase.co");
  });
});

describe("SECURITY_HEADERS", () => {
  const headerNames = SECURITY_HEADERS.map(([name]) => name);

  it("incluye Strict-Transport-Security", () => {
    expect(headerNames).toContain("Strict-Transport-Security");
  });

  it("incluye X-Frame-Options", () => {
    expect(headerNames).toContain("X-Frame-Options");
  });

  it("incluye X-Content-Type-Options", () => {
    expect(headerNames).toContain("X-Content-Type-Options");
  });
});
