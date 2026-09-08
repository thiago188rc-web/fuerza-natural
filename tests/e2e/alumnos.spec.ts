import { test, expect, type Page } from "@playwright/test";

/**
 * El recorrido completo del módulo de alumnos, en un navegador real:
 *
 *   LOGIN → ALUMNOS → LISTADO → BUSCAR → ABRIR → CREAR → EDITAR → CAMBIAR ESTADO
 *
 * REQUISITOS para correrlo (ver docs/RUNBOOK.md):
 *   1. Postgres local levantado y migrado (`npm run db:migrate`).
 *   2. `npm run db:seed` — crea el gimnasio DEMO, sus planes y el usuario
 *      de desarrollo.
 *   3. Sin `NEXT_PUBLIC_SUPABASE_*` configuradas y NODE_ENV != production:
 *      es la única combinación en la que existe la sesión simulada de
 *      desarrollo (ver src/lib/auth/config.ts). Con un Supabase real habrá
 *      que reemplazar `iniciarSesion()` por el login verdadero + TOTP.
 *
 * Los nombres de alumno llevan un sufijo único por corrida: la base de
 * desarrollo no se limpia entre corridas, y dos ejecuciones seguidas no
 * pueden pisarse.
 */

const sufijo = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export async function iniciarSesion(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@fuerzanatural.test");
  await page.getByLabel("Contraseña").fill("desarrollo");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("módulo de alumnos", () => {
  test("recorrido completo: crear, buscar, abrir, editar y cambiar estado", async ({ page }) => {
    const id = sufijo();
    const apellido = `Prueba${id}`;

    await iniciarSesion(page);

    // --- LISTADO ---
    await page.goto("/alumnos");
    await expect(page.getByRole("heading", { name: "Alumnos" })).toBeVisible();

    // --- CREAR ---
    await page.getByRole("link", { name: "Nuevo alumno" }).click();
    await expect(page).toHaveURL(/\/alumnos\/nuevo/);

    await page.getByLabel("Nombre").fill("Ana");
    await page.getByLabel("Apellido").fill(apellido);
    await page.getByLabel("Teléfono").fill("+5491155550123");
    await page.getByRole("button", { name: "Crear alumno" }).click();

    // Cae en la ficha, con el aviso de éxito.
    await expect(page).toHaveURL(/\/alumnos\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: `Ana ${apellido}` })).toBeVisible();
    await expect(page.getByText("Alumno dado de alta.")).toBeVisible();
    const urlFicha = page.url();

    // --- BUSCAR ---
    // La búsqueda navega sola mientras se escribe: no hay botón que apretar.
    await page.goto("/alumnos");
    await page.getByRole("searchbox", { name: /Buscar alumnos/ }).fill(apellido.toLowerCase());
    await expect(page.getByRole("link", { name: new RegExp(`${apellido}, Ana`) })).toBeVisible();

    // --- ABRIR ---
    await page.getByRole("link", { name: new RegExp(`${apellido}, Ana`) }).click();
    await expect(page).toHaveURL(urlFicha.split("?")[0]);

    // --- EDITAR ---
    await page.getByRole("link", { name: "Editar" }).click();
    await page.getByLabel("Nombre").fill("Ana María");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Cambios guardados.")).toBeVisible();
    await expect(page.getByRole("heading", { name: `Ana María ${apellido}` })).toBeVisible();

    // --- CAMBIAR ESTADO ---
    // Se abre un diálogo: ningún estado cambia con un solo clic.
    await page.getByRole("button", { name: "Pausar" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Motivo de la pausa").fill("viaje de trabajo");
    await page.getByRole("dialog").getByRole("button", { name: "Pausar" }).click();

    // El diálogo se cierra solo y la confirmación queda a la vista.
    await expect(page.getByText("Estado actualizado.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Pausado").first()).toBeVisible();
    // La pausa quedó en el historial, no solo en el encabezado. Se mira el
    // resumen (lo que se ve al abrir la ficha): la pestaña "Historial"
    // repite el hecho, pero oculta.
    await expect(
      page.getByRole("tabpanel", { name: "Resumen" }).getByText("pausó su membresía"),
    ).toBeVisible();
  });

  test("dar de baja NO borra al alumno: sigue existiendo, con su motivo", async ({ page }) => {
    const id = sufijo();
    const apellido = `Baja${id}`;

    await iniciarSesion(page);
    await page.goto("/alumnos/nuevo");
    await page.getByLabel("Nombre").fill("Carlos");
    await page.getByLabel("Apellido").fill(apellido);
    await page.getByRole("button", { name: "Crear alumno" }).click();
    await expect(page).toHaveURL(/\/alumnos\/[0-9a-f-]{36}/);

    await page.getByRole("button", { name: "Dar de baja" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    // El motivo sale del catálogo configurado por el gimnasio.
    await dialogo.getByText("Mudanza / distancia").click();
    await dialogo.getByRole("button", { name: "Dar de baja" }).click();
    await expect(page.getByText("Estado actualizado.")).toBeVisible();

    // Sigue existiendo, con el motivo guardado.
    await page.reload();
    await expect(page.getByText("Mudanza / distancia").first()).toBeVisible();

    // Y aparece en la pantalla de bajas, que existe justamente para dejar
    // claro que la baja no es un borrado.
    await page.goto("/bajas");
    await expect(page.getByRole("link", { name: new RegExp(`${apellido}, Carlos`) })).toBeVisible();
  });

  test("errores: el servidor rechaza un teléfono inválido con un mensaje claro", async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto("/alumnos/nuevo");

    await page.getByLabel("Nombre").fill("Telefono");
    await page.getByLabel("Apellido").fill(`Malo${sufijo()}`);
    await page.getByLabel("Teléfono").fill("1155551234");
    await page.getByRole("button", { name: "Crear alumno" }).click();

    await expect(page.getByText(/Teléfono inválido/)).toBeVisible();
    // Sigue en el formulario: no se creó nada.
    await expect(page).toHaveURL(/\/alumnos\/nuevo/);
  });
});
