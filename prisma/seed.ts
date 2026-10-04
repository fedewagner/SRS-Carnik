import { hash } from "@node-rs/argon2";
import { PrismaClient, type ProductUnit } from "@prisma/client";

const db = new PrismaClient();

const PRODUCTS: { slug: string; name: string; unit: ProductUnit; pricePerUnitCents: number; stockQuantity: string }[] = [
  { slug: "entrecot", name: "Entrecot", unit: "WEIGHT_KG", pricePerUnitCents: 3900, stockQuantity: "5.000" },
  { slug: "lomo-de-ternera", name: "Lomo de ternera", unit: "WEIGHT_KG", pricePerUnitCents: 5200, stockQuantity: "3.000" },
  { slug: "carne-picada", name: "Carne picada", unit: "WEIGHT_KG", pricePerUnitCents: 1890, stockQuantity: "8.000" },
  { slug: "pechuga-de-pollo", name: "Pechuga de pollo", unit: "WEIGHT_KG", pricePerUnitCents: 2400, stockQuantity: "6.000" },
  { slug: "costillas-de-cerdo", name: "Costillas de cerdo", unit: "WEIGHT_KG", pricePerUnitCents: 1650, stockQuantity: "4.000" },
  { slug: "salchicha-lyoner", name: "Salchicha Lyoner", unit: "PIECE", pricePerUnitCents: 190, stockQuantity: "40" },
  { slug: "cervelat", name: "Cervelat", unit: "PIECE", pricePerUnitCents: 250, stockQuantity: "30" },
  { slug: "hamburguesa", name: "Hamburguesa de ternera", unit: "PIECE", pricePerUnitCents: 450, stockQuantity: "20" },
];

/** Idempotente: dos ejecuciones dejan las mismas filas. Las existencias se restablecen al valor sembrado. */
async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error("SEED_PASSWORD es obligatorio para sembrar usuarios");
  const passwordHash = await hash(password);

  for (const p of PRODUCTS) {
    await db.product.upsert({ where: { slug: p.slug }, create: p, update: p });
  }
  for (const [email, role] of [
    ["admin@carnik.test", "ADMIN"],
    ["empleado@carnik.test", "EMPLOYEE"],
  ] as const) {
    await db.user.upsert({ where: { email }, create: { email, role, passwordHash }, update: { role, passwordHash } });
  }
  console.log(`Seed: ${PRODUCTS.length} productos, 2 usuarios`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
