import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const spec = readFileSync(path.join(root, "docs/api/openapi.yaml"), "utf8");

/** Rutas del contrato: claves de `paths` (dos espacios de sangría) con sus métodos. */
function documented(): string[] {
  const ops: string[] = [];
  let current: string | null = null;
  for (const line of spec.split("\n")) {
    const pathKey = line.match(/^ {2}(\/api\/\S+):$/);
    if (pathKey) current = pathKey[1];
    else if (/^\S/.test(line)) current = null;
    const method = current && line.match(/^ {4}(get|post|put|patch|delete):$/);
    if (method) ops.push(`${method[1].toUpperCase()} ${current}`);
  }
  return ops.sort();
}

/** Route handlers reales: cada route.ts bajo src/app/api y los métodos que exporta. */
function implemented(): string[] {
  const apiDir = path.join(root, "src/app/api");
  const files = readdirSync(apiDir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith("route.ts"));
  return files
    .flatMap((file) => {
      const route = "/api/" + path.dirname(file).split(path.sep).join("/").replace(/\[(\w+)\]/g, "{$1}");
      const source = readFileSync(path.join(apiDir, file), "utf8");
      return [...source.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => `${m[1]} ${route}`);
    })
    .sort();
}

describe("contrato OpenAPI (docs/api/openapi.yaml)", () => {
  it("documenta exactamente los route handlers que existen", () => {
    expect(documented()).toEqual(implemented());
  });

  it("documenta cada código de error que emiten los handlers", () => {
    const apiDir = path.join(root, "src/app/api");
    const codes = readdirSync(apiDir, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith("route.ts"))
      .flatMap((f) => [...readFileSync(path.join(apiDir, f), "utf8").matchAll(/jsonError\(\d+, "([A-Z_]+)"/g)].map((m) => m[1]));
    for (const code of new Set(codes)) expect(spec, code).toContain(code);
  });
});
