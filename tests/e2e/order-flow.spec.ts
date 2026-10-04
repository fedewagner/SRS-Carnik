import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

const stockOf = async (slug: string) =>
  Number((await db.product.findUniqueOrThrow({ where: { slug } })).stockQuantity);

/**
 * Flujo E2E principal: mensaje del cliente → borrador valorado → revisión en el backoffice
 * → confirmación → existencias descontadas y resumen registrado en la conversación.
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
    await page.getByLabel("Mensaje").fill("Para el sábado quiero 2 kg de entrecot y 6 salchichas");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();
    const draft = page.getByTestId("draft-result");
    await expect(draft).toContainText("Entrecot");
    await expect(draft).toContainText("Salchicha Lyoner");
    await expect(draft).toContainText("Total: CHF 89.40");
  });

  await test.step("el empleado revisa el borrador junto a la conversación", async () => {
    await page.getByRole("link", { name: /Abrir en el backoffice/ }).click();
    await expect(page.getByTestId("order-line")).toHaveCount(2);
    await expect(page.getByTestId("order-total")).toHaveText("CHF 89.40");
    await expect(page.getByTestId("message-inbound")).toContainText("2 kg de entrecot");
  });

  await test.step("confirma y el stock se descuenta", async () => {
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await expect(page.getByText(/Confirmado el/)).toBeVisible();
    await expect(page.getByTestId("message-outbound")).toContainText("está confirmado");
    expect(await stockOf("entrecot")).toBeCloseTo(entrecotBefore - 2, 3);
    expect(await stockOf("salchicha-lyoner")).toBe(salchichasBefore - 6);
  });
});
