// Recorre el flujo del backoffice y regenera las capturas de readme §1.3 en docs/screenshots/.
// Uso: con la app levantada sobre una base sembrada y vacía,
//   BASE_URL=http://localhost:3005 SEED_PASSWORD=… node scripts/capture-screenshots.mjs
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_PASSWORD;
const OUT = "docs/screenshots";
if (!PASSWORD) throw new Error("SEED_PASSWORD es obligatorio");

const browser = await chromium.launch();
const page = await browser.newPage({
  baseURL: BASE_URL,
  viewport: { width: 1280, height: 860 },
  locale: "es-CH",
  timezoneId: "Europe/Zurich",
});
// En `next dev` la primera visita a una ruta compila y puede abortar la navegación en curso.
async function go(path) {
  for (let i = 0; ; i++) {
    try {
      return await page.goto(path);
    } catch (e) {
      if (i === 2) throw e;
    }
  }
}
// El badge se refresca por polling: antes de capturar, se espera a que muestre el valor real.
async function shot(name) {
  const badge = page.getByTestId("pending-badge");
  if (await badge.count()) {
    const { count } = await (await page.request.get("/api/orders/pending-count")).json();
    await badge.filter({ hasText: `${count} por confirmar` }).waitFor({ timeout: 15_000 });
  }
  // Sin el indicador de desarrollo de Next.js.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function send(phone, profileName, text) {
  await go("/simulator");
  await page.getByLabel("Teléfono (E.164)").fill(phone);
  await page.getByLabel("Nombre de perfil").fill(profileName);
  await page.getByLabel("Mensaje").fill(text);
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await page.getByTestId("draft-result").or(page.getByText("Respuesta automática enviada")).waitFor();
}

async function openAndConfirm() {
  await page.getByRole("link", { name: /Abrir en el backoffice/ }).click();
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  await page.getByText(/Confirmado el/).waitFor();
}

// 1 · Acceso
await go("/login");
await shot("01-login");
await page.getByLabel("Email").fill("admin@carnik.test");
await page.getByLabel("Contraseña").fill(PASSWORD);
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL(/\/admin\/orders/);

// Pedidos previos para que listado y cola de armado tengan contenido
await send("+41795550101", "Anna Muster", "Hola! 2 kg de entrecot y 6 salchichas para el viernes");
await openAndConfirm();
await send("+41795550102", "Lukas Meier", "1 kg de carne picada y 4 hamburguesas por favor");
await openAndConfirm();

// 2 · El cliente escribe · 3 · El empleado revisa
await send(
  "+41795550103",
  "Marco Rossi",
  "Buenas! para el sábado quiero un kilo y medio de entrecot, medio de picada y 2 kg de cordero",
);
await shot("02-simulador-borrador");
await page.getByRole("link", { name: /Abrir en el backoffice/ }).click();
await page.getByTestId("order-total").waitFor();
const marcoUrl = page.url();
await shot("03-detalle-borrador");

// 6 · Línea sin reconocer y stock superado (queda en borrador)
await send("+41795550104", "Sofia Keller", "5 kg de costillas de cerdo y 1 kg de cordero, gracias");
await page.getByRole("link", { name: /Abrir en el backoffice/ }).click();
await page.getByTestId("order-total").waitFor();
await shot("06-linea-sin-reconocer");

// 4 · Confirma
await go(marcoUrl);
await page.getByRole("button", { name: "Confirmar pedido" }).click();
await page.getByText(/Confirmado el/).waitFor();
await shot("04-detalle-confirmado");

// 7 · Consulta de precio · 8 · Conversación completa con mensaje manual
await send("+41795550211", "Lea Frei", "Hola! ¿a cuánto está el entrecot y tienen costillas de cerdo?");
await shot("07-consulta-precio");
await send("+41795550211", "Lea Frei", "Perfecto, entonces 1 kg de entrecot y 4 cervelats para el viernes");
await openAndConfirm();
await page.getByLabel("Escribir al cliente").fill("¡Gracias Lea! Te lo dejamos listo el viernes desde las 9.");
await page.getByRole("button", { name: "Enviar al cliente" }).click();
await page.getByTestId("message-outbound").filter({ hasText: "¡Gracias Lea!" }).waitFor();
await page.getByLabel("Escribir al cliente").and(page.locator(":placeholder-shown")).waitFor();
// El hilo vive en un panel con scroll propio: se muestra el final, con el mensaje manual.
await page.getByTestId("message-outbound").last().scrollIntoViewIfNeeded();
await shot("08-mensaje-manual");

// 5 · Listado
await go("/admin/orders");
await shot("05-listado");

// 9 · Pantalla del local
await go("/dashboard");
await page.getByTestId("queue-order").first().waitFor();
await shot("09-cola-de-armado");

// 10 · Catálogo · 11 · Ficha de producto con un ingreso
await go("/admin/products");
await shot("10-catalogo");
await page.getByRole("link", { name: "Entrecot" }).click();
await page.getByLabel("Cantidad ingresada").fill("3");
await page.getByRole("button", { name: "Registrar ingreso" }).click();
await page.getByText("Ingreso registrado.").waitFor();
await shot("11-ficha-producto");

await browser.close();
console.log("Capturas regeneradas en", OUT);
