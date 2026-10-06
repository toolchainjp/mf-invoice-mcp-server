import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createServer } from "../../src/server.js";
import { SERVER_NAME, SERVER_VERSION } from "../../src/version.js";
import { createFetchMock, jsonResponse } from "../helpers/fetch-mock.js";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  version: string;
  bin: Record<string, string>;
};

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});

async function connect(env: Record<string, string>, fetchImpl: typeof fetch) {
  const config = loadConfig({ MF_TOKEN_FILE: "none", ...env });
  const server = createServer({ config, fetch: fetchImpl });
  const client = new Client({ name: "unit-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  closers.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
}

describe("version", () => {
  it("サーバー名は bin 名、バージョンは package.json と一致する", () => {
    expect(SERVER_VERSION).toBe(pkg.version);
    expect(Object.keys(pkg.bin)).toEqual([SERVER_NAME]);
  });
});

describe("createServer（インメモリ接続）", () => {
  it("サーバー情報・tools 機能・利用上の注意（instructions）を公開する", async () => {
    const client = await connect({}, createFetchMock(() => jsonResponse({})).fetch);
    expect(client.getServerVersion()).toMatchObject({ name: SERVER_NAME, version: SERVER_VERSION });
    expect(client.getServerCapabilities()?.tools).toBeDefined();
    expect(client.getInstructions()).toContain("クラウド請求書");
  });

  it("tools/list で 45 ツールを返す", async () => {
    const client = await connect({}, createFetchMock(() => jsonResponse({})).fetch);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(45);
  });

  it("MF_READ_ONLY / MF_EXCLUDE_TOOLS を反映する", async () => {
    const client = await connect(
      { MF_READ_ONLY: "true", MF_EXCLUDE_TOOLS: "get_sent_histories" },
      createFetchMock(() => jsonResponse({})).fetch,
    );
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(15);
    expect(tools.map((t) => t.name)).not.toContain("get_sent_histories");
  });

  it("tools/call でトークン取得 → API 呼び出しを行う", async () => {
    const mock = createFetchMock((call) =>
      call.url.endsWith("/token")
        ? jsonResponse({ access_token: "acc", refresh_token: "ref2", expires_in: 3600 })
        : jsonResponse({ id: "OFFICE1" }),
    );
    const client = await connect(
      {
        MF_CLIENT_ID: "cid",
        MF_CLIENT_SECRET: "sec",
        MF_REFRESH_TOKEN: "ref",
        MF_API_BASE_URL: "https://invoice.example.test/api/v3",
        MF_TOKEN_URL: "https://auth.example.test/token",
      },
      mock.fetch,
    );
    const result = await client.callTool({ name: "get_office", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(textOf(result))).toEqual({ id: "OFFICE1" });
    expect(mock.calls.map((c) => c.url)).toEqual([
      "https://auth.example.test/token",
      "https://invoice.example.test/api/v3/office",
    ]);
    expect(mock.calls[1]?.headers.authorization).toBe("Bearer acc");
  });

  it("認証情報が無くても一覧は返し、呼び出し時に設定方法を案内する", async () => {
    const mock = createFetchMock(() => jsonResponse({}));
    const client = await connect({}, mock.fetch);
    const result = await client.callTool({ name: "get_office", arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("MF_CLIENT_ID");
    expect(mock.calls).toHaveLength(0);
  });
});
