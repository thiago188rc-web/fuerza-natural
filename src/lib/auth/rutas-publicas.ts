/**
 * Rutas que se ven sin sesión. Todo lo demás, pedido sin sesión, el proxy
 * lo redirige a /login con un 307 (src/proxy.ts). No es la barrera: la
 * barrera es getAuthContext() en cada layout y withAuth() en cada acción.
 */
const RUTAS_PUBLICAS = ["/login", "/recuperar", "/auth/confirm", "/api/salud"];

export function esRutaPublica(ruta: string): boolean {
  return RUTAS_PUBLICAS.some((publica) => ruta === publica || ruta.startsWith(`${publica}/`));
}
