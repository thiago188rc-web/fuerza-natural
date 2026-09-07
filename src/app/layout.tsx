import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fuerza Natural",
  description: "Gestión de alumnos y pagos para gimnasios.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
