import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

/**
 * El verificador SCRAM-SHA-256 que Postgres guarda en pg_authid, calculado
 * acá (RFC 5802/7677, mismo formato que genera Postgres). `CREATE/ALTER
 * ROLE … PASSWORD 'SCRAM-SHA-256$…'` lo guarda tal cual: la contraseña en
 * texto plano nunca viaja a Supabase — ni por la API ni a los logs de
 * Postgres, que con `log_statement = ddl` registrarían la sentencia entera.
 */
export function verificadorScram(password: string): string {
  const salt = randomBytes(16);
  const iteraciones = 4096;
  const salted = pbkdf2Sync(password, salt, iteraciones, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iteraciones}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}
