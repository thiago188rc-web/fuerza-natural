import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Auditoría visual: recorre todas las rutas y guarda una captura de cada
 * una, en escritorio y en teléfono. No es un test — es la herramienta que
 * permite mirar el producto entero de una sentada en vez de ir pantalla
 * por pantalla a mano.
 *
 *   node scripts/capturas.mjs [carpeta-destino]
 */

const destino = process.argv[2] ?? "capturas";
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const RUTAS = [
  ["panel", "/dashboard"],
  ["alumnos", "/alumnos"],
  ["alumnos-nuevo", "/alumnos/nuevo"],
  ["pagos", "/pagos"],
  ["pagos-nuevo", "/pagos/nuevo"],
  ["actividad", "/actividad"],
  ["bajas", "/bajas"],
  ["importar", "/importar"],
  ["configuracion", "/configuracion"],
];

const VISTAS = [
  { nombre: "escritorio", viewport: { width: 1512, height: 950 } },
  { nombre: "movil", viewport: { width: 390, height: 844 } },
];

mkdirSync(destino, { recursive: true });

const navegador = await chromium.launch();

for (const vista of VISTAS) {
  const contexto = await navegador.newContext({
    viewport: vista.viewport,
    deviceScaleFactor: 2,
  });
  const page = await contexto.newPage();

  const errores = [];
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(m.text());
  });
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));

  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${destino}/${vista.nombre}-login.png`, fullPage: true });
  console.log(`✓ ${vista.nombre} · /login`);
  await page.getByLabel("Email").fill("demo@fuerzanatural.test");
  await page.getByLabel("Contraseña").fill("desarrollo");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });

  for (const [nombre, ruta] of RUTAS) {
    try {
      await page.goto(`${base}${ruta}`, { waitUntil: "networkidle", timeout: 60_000 });
      // Un respiro para que terminen las animaciones de entrada.
      await page.waitForTimeout(900);
      await page.screenshot({
        path: `${destino}/${vista.nombre}-${nombre}.png`,
        fullPage: true,
      });
      console.log(`✓ ${vista.nombre} · ${ruta}`);
    } catch (err) {
      console.log(`✗ ${vista.nombre} · ${ruta} — ${err.message.split("\n")[0]}`);
    }
  }

  // Una ficha concreta, que no tiene URL fija.
  try {
    await page.goto(`${base}/alumnos`, { waitUntil: "networkidle" });
    // El href tiene que ser un UUID: `a[href^="/alumnos/"]` también
    // matchea el botón "Nuevo alumno" y la captura terminaba en el alta.
    const primera = page
      .locator('a[href*="/alumnos/"]')
      .filter({ hasNotText: "Nuevo" })
      .locator('visible=true')
      .first();
    await primera.click();
    await page.waitForURL(/\/alumnos\/[0-9a-f-]{36}/, { timeout: 30_000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${destino}/${vista.nombre}-ficha.png`, fullPage: true });
    console.log(`✓ ${vista.nombre} · ficha`);
  } catch (err) {
    console.log(`✗ ${vista.nombre} · ficha — ${err.message.split("\n")[0]}`);
  }

  if (errores.length > 0) {
    console.log(`\n  Errores de consola en ${vista.nombre}:`);
    for (const e of [...new Set(errores)].slice(0, 12)) console.log(`   · ${e}`);
  }

  await contexto.close();
}

await navegador.close();
console.log(`\nCapturas en ${destino}/`);
