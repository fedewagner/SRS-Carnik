import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

const stockOf = async (slug: string) =>
  Number((await db.product.findUniqueOrThrow({ where: { slug } })).stockQuantity);

/**
 * Flujo E2E principal: mensaje del cliente → borrador valorado → revisión en el backoffice
 * → ajuste de una cantidad → confirmación → existencias descontadas y resumen registrado en la conversación.
 */
test("un mensaje de WhatsApp se convierte en un pedido confirmado", async ({ page }) => {
  const phone = `+4179${Date.now().toString().slice(-7)}`;
  const entrecotBefore = await stockOf("entrecot");
  const salchichasBefore = await stockOf("salchicha-lyoner");

  await test.step("el empleado entra al backoffice", async () => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email").fill("empleado@carnik.test");
    await page.getByLabel("Contraseña").fill(process.env.SEED_PASSWORD ?? "carnik-test");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/admin\/orders/);
  });

  await test.step("el cliente escribe su pedido (simulador)", async () => {
    await page.getByRole("link", { name: "Simulador WhatsApp" }).click();
    await page.getByLabel("Teléfono (E.164)").fill(phone);
    await page.getByLabel("Mensaje").fill("Para el sábado quiero 2 kg de entrecot, 6 salchichas y 1 kg de cordero");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();
    const draft = page.getByTestId("draft-result");
    await expect(draft).toContainText("Entrecot");
    await expect(draft).toContainText("Salchicha Lyoner");
    await expect(draft).toContainText("Total: CHF 89.40");
  });

  await test.step("el empleado revisa el borrador junto a la conversación", async () => {
    await page.getByRole("link", { name: /Abrir en el backoffice/ }).click();
    await expect(page.getByTestId("order-line")).toHaveCount(3);
    await expect(page.getByTestId("order-total")).toHaveText("CHF 89.40");
    await expect(page.getByTestId("message-inbound")).toContainText("2 kg de entrecot");
  });

  await test.step("asigna un producto a la mención sin reconocer", async () => {
    const costillas = await page.locator("option", { hasText: "Costillas de cerdo" }).first().getAttribute("value");
    await page.getByLabel("Producto para «1 kg de cordero»").selectOption(costillas!);
    await page.getByRole("button", { name: "Asignar" }).click();
    // 89,40 + 1 kg × 16,50
    await expect(page.getByTestId("order-total")).toHaveText("CHF 105.90");
    await expect(page.getByTestId("line-stock")).toHaveCount(3);
  });

  await test.step("ajusta la cantidad de una línea antes de confirmar (US-08)", async () => {
    await page.getByLabel("Cantidad de Entrecot").fill("1,5");
    await page.getByLabel("Cantidad de Entrecot").press("Enter");
    // 1,5 kg × 39,00 + 6 × 1,90
    await expect(page.getByTestId("order-total")).toHaveText("CHF 86.40"); // 105,90 − 0,5 kg × 39
  });

  await test.step("confirma y el stock se descuenta", async () => {
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await expect(page.getByText(/Confirmado el/)).toBeVisible();
    const outbound = page.getByTestId("message-outbound");
    await expect(outbound).toHaveCount(2);
    await expect(outbound.first()).toContainText("Anotamos: 2 kg Entrecot y 6 u. Salchicha Lyoner");
    await expect(outbound.first()).toContainText("Revisamos a mano: «1 kg de cordero»");
    await expect(outbound.last()).toContainText("está confirmado");
    expect(await stockOf("entrecot")).toBeCloseTo(entrecotBefore - 1.5, 3);
    expect(await stockOf("salchicha-lyoner")).toBe(salchichasBefore - 6);
  });
});
