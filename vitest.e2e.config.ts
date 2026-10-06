import { defineConfig } from "vitest/config";

// E2E: ビルド済み dist/index.js を stdio で起動し、ローカルのモック API に対して実行する
export default defineConfig({
  test: {
    include: ["test/e2e/**/*.e2e.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
