import { defineConfig } from "vitest/config";

// ユニットテスト: 外部依存なし（fetch はモック）
export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts"],
    environment: "node",
  },
});
