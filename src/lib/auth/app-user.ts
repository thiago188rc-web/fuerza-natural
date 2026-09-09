import { getSql } from "@/data/db";

/**
 * El puente entre Supabase Auth y el sistema: dado el UUID del usuario de
 * Supabase, devuelve su fila de `app.app_users` (gimnasio, rol, estado).
 *
 * Pasa SIEMPRE por `app.get_app_user_by_auth_id()` — la única función que
 * puede leer `app_users` sin conocer todavía el gym_id, que es exactamente
 * el problema de arranque de la autenticación (ver
 * db/migrations/infra/01_rls_and_triggers.sql). Nunca un SELECT directo
 * contra `app_users` desde la app: sin contexto de tenant devolvería cero
 * filas, y con contexto sería circular.
 *
 * La fila la crea un administrador con `npm run db:provision-owner` — nunca
 * la aplicación, y nunca una pantalla pública. Sin fila, el usuario existe
 * en Supabase pero no en el sistema, y no entra.
 */
export interface AppUser {
  id: string;
  gymId: string;
  rol: string;
  activo: boolean;
  email: string;
  nombre: string;
}

interface FilaAppUser {
  id: string;
  gym_id: string;
  rol: string;
  activo: boolean;
  email: string;
  nombre: string;
}

export async function buscarAppUserPorAuthId(authUserId: string): Promise<AppUser | null> {
  const sql = getSql();
  const filas = await sql<FilaAppUser[]>`
    SELECT id, gym_id, rol, activo, email, nombre
    FROM app.get_app_user_by_auth_id(${authUserId})
  `;

  const fila = filas[0];
  if (!fila) return null;

  return {
    id: fila.id,
    gymId: fila.gym_id,
    rol: fila.rol,
    activo: fila.activo,
    email: fila.email,
    nombre: fila.nombre,
  };
}
