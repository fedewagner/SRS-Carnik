import { hash } from "@node-rs/argon2";
import { db } from "@/lib/db";

export async function resetDatabase() {
  await db.$executeRawUnsafe(
    'TRUNCATE "OrderItem", "Order", "Message", "Conversation", "Customer", "Product", "User" CASCADE',
  );
}

export async function seedCatalog() {
  await db.product.createMany({
    data: [
      { slug: "entrecot", name: "Entrecot", unit: "WEIGHT_KG", pricePerUnitCents: 3900, stockQuantity: "5.000" },
      { slug: "salchicha-lyoner", name: "Salchicha Lyoner", unit: "PIECE", pricePerUnitCents: 190, stockQuantity: "40" },
      { slug: "cervelat", name: "Cervelat", unit: "PIECE", pricePerUnitCents: 250, stockQuantity: "30" },
    ],
  });
}

export async function createEmployee() {
  return db.user.create({
    data: { email: "empleado@carnik.test", role: "EMPLOYEE", passwordHash: await hash("carnik-test") },
  });
}
