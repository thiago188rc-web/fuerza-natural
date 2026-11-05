import { test, expect, type Page } from "@playwright/test";

/**
 * El flujo de cobro completo, en un navegador real:
 *
 *   BUSCAR → ELEGIR → REVISAR LA COBERTURA → CONFIRMAR
 *
 * Y las dos reglas que este módulo no puede romper nunca:
 *
 *   · un pago NO cambia el plan habitual del alumno;
 *   · cobrar dos veces el mismo período pide confirmación explícita en
 *     lugar de escribirse en silencio.
 *
 * Mismos requisitos que el spec de alumnos: Postgres local migrado,
 * `npm run db:seed` y la sesión simulada de desarrollo.
 *
 * Cada corrida crea su propio alumno con un sufijo único, así dos
 * ejecuciones seguidas no se pisan.
 */

const sufijo = () => Math.random().toString(36).slice(2, 8).toUpperCase();

async function iniciarSesion(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@fuerzanatural.test");
  await page.getByLabel("Contraseña").fill("desarrollo");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Crea un alumno y devuelve la URL de su ficha. */
async function crearAlumno(page: Page, apellido: string): Promise<string> {
  await page.goto("/alumnos/nuevo");
  await page.getByLabel("Nombre").fill("Pago");
  await page.getByLabel("Apellido").fill(apellido);
  await page.getByRole("button", { name: "Crear alumno" }).click();
  await expect(page).toHaveURL(/\/alumnos\/[0-9a-f-]{36}/);
  return page.url().split("?")[0];
}

test.describe("módulo de pagos", () => {
  test("registrar un pago: buscar, revisar la cobertura y confirmar", async ({
    page,
  }) => {
    const apellido = `Cobro${sufijo()}`;
    await iniciarSesion(page);
    const ficha = await crearAlumno(page, apellido);

    // --- BUSCAR ---
    await page.goto("/pagos/nuevo");
    await expect(page.getByRole("heading", { name: "Registrar pago" })).toBeVisible();
    await page.getByRole("textbox", { name: "Buscar alumno" }).fill(apellido.toLowerCase());
    await page.getByRole("link", { name: new RegExp(`Pago ${apellido}`) }).click();

    // --- REVISAR ---
    await expect(page).toHaveURL(/\/pagos\/nuevo\?alumno=/);
    await expect(page.getByRole("heading", { name: "Cobrarle a Pago" })).toBeVisible();
    // La cobertura que se va a registrar está a la vista ANTES de confirmar.
    await expect(page.getByText("Va a cubrir")).toBeVisible();

    // El importe se autocompleta con el precio configurado del plan.
    const monto = page.getByLabel("Importe cobrado");
    await expect(monto).not.toHaveValue("");

    // --- CONFIRMAR ---
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await expect(page.getByRole("heading", { name: "Pago registrado" })).toBeVisible();
    await expect(page.getByText(`Pago ${apellido}`)).toBeVisible();

    // --- APARECE EN LA FICHA, CON EL PERÍODO QUE CUBRE ---
    await page.goto(ficha);
    await expect(page.getByRole("heading", { name: "Pagos" })).toBeVisible();
    await expect(page.getByText("1 registro").first()).toBeVisible();
  });

  test("cobrar dos veces el mismo período pide confirmación, no lo hace en silencio", async ({
    page,
  }) => {
    const apellido = `Doble${sufijo()}`;
    await iniciarSesion(page);
    const ficha = await crearAlumno(page, apellido);
    const idAlumno = ficha.split("/").pop();

    // Primer pago del mes en curso.
    await page.goto(`/pagos/nuevo?alumno=${idAlumno}`);
    // El período que se está por cobrar, tal cual viaja al servidor.
    const periodo = page.locator('input[name="cubreDesde"]');
    const mesCobrado = await periodo.inputValue();
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await expect(page.getByRole("heading", { name: "Pago registrado" })).toBeVisible();

    // Al volver, el formulario NO propone el mes que ya se cobró: propone el
    // siguiente. Es el default inteligente, no una regla — se puede volver.
    await page.goto(`/pagos/nuevo?alumno=${idAlumno}`);
    await expect(periodo).not.toHaveValue(mesCobrado);

    // Volver al mes YA cubierto, con "otra fecha de inicio". La pantalla
    // avisa antes de que apretemos nada: advierte, no corrige ni bloquea.
    await page.getByRole("button", { name: "Elegir otra fecha de inicio" }).click();
    await page.getByLabel("Arranca el").fill(mesCobrado);
    await expect(periodo).toHaveValue(mesCobrado);
    await expect(page.getByText("Ya hay cobertura registrada en este período")).toBeVisible();

    // Y al confirmar, el servidor devuelve CONFIRMACION_REQUERIDA: muestra
    // exactamente qué se superpone en lugar de escribirlo en silencio.
    await page.getByRole("button", { name: "Registrar pago" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText("Este período ya está cubierto")).toBeVisible();

    // "Revisar" cierra el diálogo sin escribir nada.
    await dialogo.getByRole("button", { name: "Revisar" }).click();
    await expect(dialogo).toBeHidden();

    await page.goto(ficha);
    await expect(page.getByText("1 registro").first()).toBeVisible();
  });

  test("confirmar la superposición sí registra el segundo pago", async ({
    page,
  }) => {
    const apellido = `Confirma${sufijo()}`;
    await iniciarSesion(page);
    const ficha = await crearAlumno(page, apellido);
    const idAlumno = ficha.split("/").pop();

    await page.goto(`/pagos/nuevo?alumno=${idAlumno}`);
    const mesCobrado = await page.locator('input[name="cubreDesde"]').inputValue();
    await page.getByRole("button", { name: "Registrar pago" }).click();
    await expect(page.getByRole("heading", { name: "Pago registrado" })).toBeVisible();

    await page.goto(`/pagos/nuevo?alumno=${idAlumno}`);
    await page.getByRole("button", { name: "Elegir otra fecha de inicio" }).click();
    await page.getByLabel("Arranca el").fill(mesCobrado);
    await page.getByRole("button", { name: "Registrar pago" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole("button", { name: "Registrar igual" }).click();

    // La confirmación explícita es lo único que habilita el segundo registro.
    await expect(page.getByRole("heading", { name: "Pago registrado" })).toBeVisible();
    await page.goto(ficha);
    await expect(page.getByText("2 registros").first()).toBeVisible();
  });

  test("adelantar dos meses: período futuro elegido, un pago por mes, el plan no cambia", async ({
    page,
  }) => {
    const apellido = `Adelanto${sufijo()}`;
    await iniciarSesion(page);

    // El plan habitual se lee del alta, no se supone: es exactamente el que
    // tiene que seguir intacto cuando termine el cobro.
    await page.goto("/alumnos/nuevo");
    // Del span del valor y no del botón entero: el botón arrastra el chevron
    // decorativo, y antes de que termine de aplicarse el CSS eso se cuela en
    // el texto.
    const selectorDePlan = page.getByRole("combobox", { name: "Plan" });
    const planHabitual =
      (await selectorDePlan.locator("[data-slot=select-value]").textContent())?.trim() ?? "";
    expect(planHabitual).not.toBe("");
    await page.getByLabel("Nombre").fill("Pago");
    await page.getByLabel("Apellido").fill(apellido);
    await page.getByRole("button", { name: "Crear alumno" }).click();
    await expect(page).toHaveURL(/\/alumnos\/[0-9a-f-]{36}/);
    const ficha = page.url().split("?")[0];
    const idAlumno = ficha.split("/").pop();

    await page.goto(`/pagos/nuevo?alumno=${idAlumno}`);
    // Esperar a que el formulario se VEA: con streaming llega primero dentro
    // de un <div hidden> y React lo muestra después. Las aserciones de
    // atributo y de valor no esperan eso, y el check de abajo fallaba.
    await expect(page.getByText("Período que paga", { exact: true })).toBeVisible();

    // La fecha de cobro no acepta el futuro: para adelantar se elige el
    // período, no se corre la fecha (docs/REGLAS-DE-NEGOCIO.md §5bis).
    const fechaDeCobro = page.getByLabel("Fecha de cobro");
    await expect(fechaDeCobro).toHaveAttribute("max", await fechaDeCobro.inputValue());

    // El segundo período ofrecido es un adelanto; dos meses desde ahí.
    await page.locator('input[name="periodo-del-pago"]').nth(1).check({ force: true });
    await expect(page.getByText("Adelantado").first()).toBeVisible();
    await page.getByRole("radio", { name: "2", exact: true }).check();
    await expect(page.getByText(/× 2 meses/)).toBeVisible();

    await page.getByRole("button", { name: "Registrar pago" }).click();
    await expect(page.getByRole("heading", { name: "Pago registrado" })).toBeVisible();
    await expect(page.getByText(/^2 × /)).toBeVisible();

    // Dos pagos (uno por mes) y el plan del alumno sigue siendo el mismo.
    await page.goto(ficha);
    await expect(page.getByText("2 registros").first()).toBeVisible();
    await expect(page.getByText(planHabitual, { exact: true }).first()).toBeVisible();
  });

  test("el historial muestra el pago con el período que cubre", async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto("/pagos");
    await expect(page.getByRole("heading", { name: "Pagos" })).toBeVisible();
    // La columna que distingue a este sistema: qué período cubrió el pago,
    // no solo cuándo se cobró.
    await expect(page.getByRole("columnheader", { name: "Cubre" })).toBeVisible();
    await expect(page.getByText("Total del mes")).toBeVisible();
    // El N.º para contar: arranca en 1.
    await expect(page.getByRole("columnheader", { name: /N\.º/ })).toBeVisible();
  });
});
