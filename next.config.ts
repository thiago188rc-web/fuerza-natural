import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador flotante de Next DevTools (la "N" abajo a la izquierda)
  // solo existe en `next dev`, pero es donde se hacen las demos. Apagado:
  // no es parte del producto y en pantalla compartida parece un bug.
  devIndicators: false,
};

export default nextConfig;
