import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

/**
 * Gestión del catálogo (US-15): el dueño sube un precio y el borrador abierto se revalora;
 * después de confirmarlo carga lo envasado y ve ambos movimientos en el historial.
 * Usa "Lomo de ternera", que el flujo principal no toca; el seed restablece su precio.
 */
test("el dueño cambia un precio, el borrador se revalora y el stock queda registrado", async ({ page }) => {
  const phone = `+4178${Date.now().toString().slice(-7)}`;
  const lomo = await db.product.findUniqueOrThrow({ where: { slug: "lomo-de-ternera" } });
  const newCents = lomo.pricePerUnitCents + 100;
  const chf = (cents: number) => `CHF ${(cents / 100).toFixed(2)}`;
  let orderUrl = "";

  await test.step("el dueño entra y llega un pedido de lomo", async () => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@carnik.test");
    await page.getByLabel("Contraseña").fill(process.env.SEED_PASSWORD ?? "carnik-test");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/admin\/orders/);

    await page.getByRole("link", { name: "Simulador WhatsApp" }).click();
    await page.getByLabel("Teléfono (E.164)").fill(phone);
    await page.getByLabel("Mensaje").fill("1 kg de lomo de ternera");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();
    await page.getByRole("link", { name: /Abrir en el backoffice/ }).click();
    await expect(page.getByTestId("order-total")).toHaveText(chf(lomo.pricePerUnitCents));
    orderUrl = page.url();
  });

  await test.step("sube el precio desde el catálogo", async () => {
    await page.getByRole("link", { name: "Catálogo" }).click();
    await page.getByRole("link", { name: "Lomo de ternera" }).click();
    await page.getByLabel("Nuevo precio").fill((newCents / 100).toFixed(2).replace(".", ","));
    await page.getByRole("button", { name: "Cambiar precio" }).click();
    await expect(page.getByText("Precio actualizado")).toBeVisible();
  });

  await test.step("el borrador abierto muestra el precio nuevo y se confirma", async () => {
    await page.goto(orderUrl);
    await expect(page.getByTestId("order-total")).toHaveText(chf(newCents));
    await page.getByRole("button", { name: "Confirmar pedido" }).click();
    await expect(page.getByText(/Confirmado el/)).toBeVisible();
    await expect(page.getByTestId("message-outbound").last()).toContainText(chf(newCents));
  });

  await test.step("carga lo envasado y ve el historial", async () => {
    await page.getByRole("link", { name: "Catálogo" }).click();
    await page.getByRole("link", { name: "Lomo de ternera" }).click();
    await page.getByLabel("Cantidad ingresada").fill("2");
    await page.getByRole("button", { name: "Registrar ingreso" }).click();
    await expect(page.getByText("Ingreso registrado.")).toBeVisible();
    const movements = page.getByTestId("movements");
    await expect(movements).toContainText("Ingreso");
    await expect(movements).toContainText("Pedido confirmado");
  });
});
