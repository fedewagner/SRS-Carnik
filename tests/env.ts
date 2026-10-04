import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

const CI_KEYS = ["DATABASE_URL", "SESSION_SECRET", "ORDER_DRAFTER", "WHATSAPP_TRANSPORT", "SIMULATOR_ENABLED", "SEED_PASSWORD"];

/**
 * Variables de test: las de tests/test.env (sin secretos), sobrescritas por las que ya
 * existan en el entorno, que es como llegan en CI. Nunca se lee el .env de desarrollo.
 */
export function testEnv(): Record<string, string> {
  const file = parse(readFileSync(path.resolve(__dirname, "test.env")));
  const fromProcess = Object.fromEntries(
    CI_KEYS.filter((k) => process.env[k]).map((k) => [k, process.env[k]!]),
  );
  return { ...file, ...fromProcess };
}
