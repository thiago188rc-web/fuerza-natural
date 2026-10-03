/**
 * ¿A qué base apunta una URL de Postgres? Y la barrera que impide que los
 * tests y los scripts de desarrollo escriban en una base remota.
 *
 * Por qué existe: hasta el 2026-10-02 `.env.local` apuntaba al pooler del
 * proyecto Supabase de producción VIEJO, y los tests de integración crean
 * gimnasios de prueba en la base de `DATABASE_URL`. Ese proyecto estaba
 * pausado y los tests fallaban por DNS; si alguien lo reanudaba, `npm test`
 * escribía datos de prueba en una producción. La regla ahora es estructural:
 * tests, semillas y migraciones de desarrollo solo aceptan una base en esta
 * máquina. Producción se toca únicamente con los scripts `db:prod:*`, que
 * leen `.env.produccion.local` y lo declaran con `--produccion`.
 *
 * Nunca imprime la URL completa (lleva la contraseña): solo el host.
 */

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1"]);

/** El host de una URL de Postgres, o null si no se puede leer. */
export function hostDeLaBase(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    if (!hostname) return null;
    return hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return null;
  }
}

export function esBaseLocal(url: string): boolean {
  const host = hostDeLaBase(url);
  return host !== null && HOSTS_LOCALES.has(host);
}

/**
 * Lanza si `url` no es una base local. Una URL que no se puede leer cuenta
 * como remota: ante la duda, no se escribe.
 */
export function exigirBaseLocal(url: string | undefined, quien: string): void {
  if (!url) return;
  if (esBaseLocal(url)) return;
  const host = hostDeLaBase(url) ?? "(URL ilegible)";
  throw new Error(
    `${quien}: se niega a usar la base en ${host}. Solo se aceptan bases locales ` +
      `(localhost, 127.0.0.1). Para los tests usá \`npm run test:aislado\` o un ` +
      `.env.test.local que apunte a un Postgres de esta máquina. Producción se ` +
      `toca solo con los scripts db:prod:*.`,
  );
}
