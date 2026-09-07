/**
 * Construye el valor de la CSP para una request, con un nonce fresco por
 * request (nunca reutilizado). SPEC V1 §3.14.
 *
 * `style-src 'unsafe-inline'` es una concesión deliberada y acotada:
 * Next.js inyecta estilos inline para algunas cosas (p. ej. optimización
 * de fuentes). El riesgo real de XSS vive en `script-src`, que queda
 * cerrado (`'self' 'nonce-...' 'strict-dynamic'`, sin `unsafe-inline` ni
 * `unsafe-eval`).
 */
export function buildCsp(nonce: string, supabaseUrl: string): string {
  const connectSrc = ["'self'"];
  if (supabaseUrl) connectSrc.push(supabaseUrl);

  const isDev = process.env.NODE_ENV === "development";
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (isDev) {
    scriptSrc.push("'unsafe-eval'");
  }

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(" ")}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src ${connectSrc.join(" ")}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ];

  if (!isDev) {
    directives.push(`upgrade-insecure-requests`);
  }

  return directives.join("; ");
}

/**
 * Headers de seguridad aplicados a TODA respuesta (SPEC V1 §3.14). La CSP
 * se calcula aparte (necesita el nonce por request) y se agrega en
 * middleware.ts junto con estos.
 */
export const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["X-Frame-Options", "DENY"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
];
