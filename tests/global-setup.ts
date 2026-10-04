import { execSync } from "node:child_process";
import { testEnv } from "./env";

/** Aplica las migraciones a la base de test antes de cualquier suite. */
export default function setup() {
  const env = { ...process.env, ...testEnv() };
  if (!env.DATABASE_URL?.includes("test")) {
    throw new Error("Los tests sólo corren contra una base cuyo nombre contenga 'test'");
  }
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
}
