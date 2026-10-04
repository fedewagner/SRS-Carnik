import path from "node:path";
import { defineConfig } from "vitest/config";
import { testEnv } from "./tests/env";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    env: testEnv(),
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
  },
});
