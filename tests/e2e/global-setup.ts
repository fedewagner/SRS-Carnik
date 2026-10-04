import { execSync } from "node:child_process";

/** Base de test migrada y sembrada: catálogo con existencias conocidas y los dos usuarios. */
export default function globalSetup() {
  const run = (cmd: string) => execSync(`npx dotenv -e tests/test.env -- ${cmd}`, { stdio: "inherit" });
  run("npx prisma migrate deploy");
  run("npx prisma db seed");
}
