import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 実際のマネーフォワード クラウド請求書 API に対するライブ E2E（参照系のみ）。
 * `npm run test:e2e:live` で明示的に実行する。通常の `npm run test:all` には含まれない。
 *
 * 必要な環境変数（どちらか）:
 *   MF_CLIENT_ID + MF_CLIENT_SECRET + MF_REFRESH_TOKEN（またはトークンファイル MF_TOKEN_FILE）
 *   MF_ACCESS_TOKEN
 *
 * 安全のため MF_READ_ONLY=true で起動し、書き込み系ツールは公開されない状態で実行する。
 */
const SERVER_ENTRY = fileURLToPath(new URL("../../dist/index.js", import.meta.url));
const PASSTHROUGH = [
  "HOME",
  "XDG_CONFIG_HOME",
  "MF_ACCESS_TOKEN",
  "MF_CLIENT_ID",
  "MF_CLIENT_SECRET",
  "MF_REFRESH_TOKEN",
  "MF_TOKEN_FILE",
  "MF_TOKEN_AUTH_METHOD",
  "MF_API_BASE_URL",
  "MF_TOKEN_URL",
  "MF_TIMEOUT_MS",
];

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
}

describe("ライブ E2E: クラウド請求書 API（参照系）", () => {
  let client: Client;

  beforeAll(async () => {
    const hasRefresh = process.env.MF_CLIENT_ID && process.env.MF_CLIENT_SECRET;
    if (!hasRefresh && !process.env.MF_ACCESS_TOKEN) {
      throw new Error(
        "ライブ E2E には MF_CLIENT_ID + MF_CLIENT_SECRET（+ MF_REFRESH_TOKEN かトークンファイル）または MF_ACCESS_TOKEN が必要です（docs/testing.md 参照）",
      );
    }
    if (!existsSync(SERVER_ENTRY))
      throw new Error("dist/index.js がありません。先に npm run build を実行してください");

    const env: Record<string, string> = { PATH: process.env.PATH ?? "", MF_READ_ONLY: "true" };
    for (const key of PASSTHROUGH) {
      const value = process.env[key];
      if (value) env[key] = value;
    }
    client = new Client({ name: "live-e2e", version: "0.0.0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER_ENTRY], env }));
  });

  afterAll(async () => {
    await client?.close();
  });

  it("読み取り専用モードで 16 ツールが公開される", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(16);
  });

  it.each([
    ["get_office", {}],
    ["get_partners", { per_page: 1 }],
    ["get_items", { per_page: 1 }],
    ["get_billings", { per_page: 1 }],
    ["get_quotes", { per_page: 1 }],
    ["get_sent_histories", { per_page: 1 }],
  ])("%s が成功する", async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(() => JSON.parse(textOf(result))).not.toThrow();
  });
});
