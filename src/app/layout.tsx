import type { Metadata } from "next";
import { headers } from "next/headers";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Archivo es la "voz" del producto: una grotesca industrial, pensada para
 * rendir en contextos exigentes. Se usa SOLO en títulos y navegación —
 * Geist queda para el texto denso de interfaz, donde su legibilidad a
 * cuerpo chico es mejor. Dos familias, dos trabajos distintos.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "NEXA GYM OS", template: "%s · NEXA" },
  description: "Central de operaciones de Fuerza Natural: alumnos, cobertura de pagos y actividad.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // src/proxy.ts genera un nonce nuevo por request y lo expone en el
  // header 'x-nonce' de la request entrante (no en el de la respuesta).
  // Ningún <script> inline propio lo necesita todavía — la CSP actual
  // (ver src/lib/security/headers.ts) solo lo exige para script-src, y
  // Next.js no está inyectando scripts inline propios en este shell. Lo
  // leemos y lo dejamos documentado en el DOM para cuando una fase
  // posterior agregue un script inline real y necesite este valor.
  const nonce = (await headers()).get("x-nonce");

  return (
    <html
      lang="es"
      data-csp-nonce={nonce ?? undefined}
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
