import { defineConfig } from "vitest/config";

// ライブ E2E: 実際のマネーフォワード クラウド請求書 API を参照系のみで呼び出す（明示実行のみ）
export default defineConfig({
  test: {
    include: ["test/e2e-live/**/*.e2e.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
