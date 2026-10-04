import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BASIC_AUTH,
  MOCK_CLIENT_ID,
  MOCK_CLIENT_SECRET,
  MOCK_REFRESH_TOKEN,
  MOCK_STATIC_ACCESS_TOKEN,
  startMockMfApi,
} from "../helpers/mock-mf-api.js";

// ビルド済みのサーバーを実際に子プロセスとして stdio で起動し、MCP クライアントから操作する
const SERVER_ENTRY = fileURLToPath(new URL("../../dist/index.js", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  version: string;
};

type MockApi = Awaited<ReturnType<typeof startMockMfApi>>;

const clients: Client[] = [];
const tempDirs: string[] = [];

async function startClient(env: Record<string, string>) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY],
    env: { PATH: process.env.PATH ?? "", ...env },
    stderr: "pipe",
  });
  const client = new Client({ name: "e2e-test", version: "0.0.0" });
  await client.connect(transport);
  clients.push(client);
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("\n");
}

function tempTokenFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "mf-invoice-e2e-"));
  tempDirs.push(dir);
  return join(dir, "token.json");
}

describe("E2E: stdio で起動した MCP サーバー × 模擬 API", () => {
  let api: MockApi;
  let client: Client;
  let tokenFile: string;

  beforeAll(async () => {
    if (!existsSync(SERVER_ENTRY))
      throw new Error("dist/index.js がありません。先に npm run build を実行してください");
    api = await startMockMfApi();
    tokenFile = tempTokenFile();
    client = await startClient({
      MF_CLIENT_ID: MOCK_CLIENT_ID,
      MF_CLIENT_SECRET: MOCK_CLIENT_SECRET,
      MF_REFRESH_TOKEN: MOCK_REFRESH_TOKEN,
      MF_TOKEN_FILE: tokenFile,
      MF_API_BASE_URL: api.apiBaseUrl,
      MF_TOKEN_URL: api.tokenUrl,
    });
  });

  afterAll(async () => {
    for (const c of clients) await c.close();
    await api?.close();
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => api.reset());

  it("initialize でサーバー名とバージョンを返す", () => {
    expect(client.getServerVersion()).toMatchObject({ name: "mf-invoice-mcp-server", version: pkg.version });
  });

  it("tools/list で 45 ツールと入力スキーマ・注記を返す", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(45);
    const get = tools.find((t) => t.name === "get_partners_id");
    expect(get?.inputSchema.required).toEqual(["partner_id"]);
    expect(get?.annotations?.readOnlyHint).toBe(true);
    const del = tools.find((t) => t.name === "delete_billings_id");
    expect(del?.annotations?.destructiveHint).toBe(true);
    expect(tools.find((t) => t.name === "post_billings_billing_id_posting")?.description).toContain("料金");
  });

  it("リフレッシュトークンでアクセストークンを取得し（client_secret_basic）、Bearer で API を呼ぶ", async () => {
    const result = await client.callTool({ name: "get_office", arguments: {} });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(JSON.parse(textOf(result))).toEqual({
      id: "OFFICE1",
      name: "テスト株式会社",
      office_code: "1234-5678",
    });

    const [tokenReq] = api.tokenRequests();
    expect(tokenReq?.authorization).toBe(BASIC_AUTH);
    expect(tokenReq?.contentType).toContain("application/x-www-form-urlencoded");
    expect(tokenReq?.body).toEqual({ grant_type: "refresh_token", refresh_token: MOCK_REFRESH_TOKEN });

    const [apiReq] = api.apiRequests();
    expect(apiReq).toMatchObject({ method: "GET", path: "/api/v3/office", authorization: "Bearer access-1" });
  });

  it("取得したアクセストークンを再利用し、ローテーション後のトークンをファイルに保存する", async () => {
    await client.callTool({ name: "get_office", arguments: {} });
    expect(api.tokenRequests()).toHaveLength(0);
    const saved = JSON.parse(readFileSync(tokenFile, "utf8")) as Record<string, unknown>;
    expect(saved).toMatchObject({
      client_id: MOCK_CLIENT_ID,
      access_token: "access-1",
      refresh_token: "refresh-1",
    });
  });

  it("クエリパラメータを送る", async () => {
    const result = await client.callTool({
      name: "get_partners",
      arguments: { name: "取引先A,取引先B", page: 2, per_page: 10 },
    });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(JSON.parse(textOf(result)).pagination.total_count).toBe(1);
    expect(api.apiRequests()[0]?.query).toEqual([
      ["name", "取引先A,取引先B"],
      ["page", "2"],
      ["per_page", "10"],
    ]);
  });

  it("パスパラメータをエンコードして送る", async () => {
    const result = await client.callTool({ name: "get_billings_id", arguments: { billing_id: "B/1" } });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(api.apiRequests()[0]?.path).toBe("/api/v3/billings/B%2F1");
  });

  it("リクエストボディを JSON で送る", async () => {
    const body = { name: "新規取引先", code: "C-001", departments: [{ person_name: "山田" }] };
    const result = await client.callTool({ name: "post_partners", arguments: { body } });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(JSON.parse(textOf(result))).toEqual({ id: "P-NEW", ...body });
    expect(api.apiRequests()[0]).toMatchObject({ method: "POST", contentType: "application/json", body });
  });

  it("204 応答は成功として返す", async () => {
    const result = await client.callTool({ name: "delete_partners_id", arguments: { partner_id: "P1" } });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("HTTP 204");
  });

  it("402 応答（郵送依頼）は API のメッセージと料金のヒントをエラー結果で返す", async () => {
    const result = await client.callTool({
      name: "post_billings_billing_id_posting",
      arguments: { billing_id: "B1", body: { upload_to_cloud_box: false } },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("HTTP 402");
    expect(textOf(result)).toContain("郵送料金の支払い方法が登録されていません");
  });

  it("429 応答は Retry-After を案内する", async () => {
    const result = await client.callTool({ name: "get_items", arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("30 秒");
  });

  it("入力が不正なら API を呼ばない", async () => {
    const result = await client.callTool({
      name: "put_office_registration_code",
      arguments: { body: { registration_code: "1234" } },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("入力が不正です");
    expect(api.requests).toHaveLength(0);
  });

  it("再起動後はトークンファイルのアクセストークンを使い、トークンを取り直さない", async () => {
    const restarted = await startClient({
      MF_CLIENT_ID: MOCK_CLIENT_ID,
      MF_CLIENT_SECRET: MOCK_CLIENT_SECRET,
      MF_TOKEN_FILE: tokenFile,
      MF_API_BASE_URL: api.apiBaseUrl,
      MF_TOKEN_URL: api.tokenUrl,
    });
    const result = await restarted.callTool({ name: "get_office", arguments: {} });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(api.tokenRequests()).toHaveLength(0);
    expect(api.apiRequests()[0]?.authorization).toBe("Bearer access-1");
  });

  it("client_secret_post 方式でもトークンを取得できる", async () => {
    const c = await startClient({
      MF_CLIENT_ID: MOCK_CLIENT_ID,
      MF_CLIENT_SECRET: MOCK_CLIENT_SECRET,
      MF_REFRESH_TOKEN: MOCK_REFRESH_TOKEN,
      MF_TOKEN_AUTH_METHOD: "client_secret_post",
      MF_TOKEN_FILE: "none",
      MF_API_BASE_URL: api.apiBaseUrl,
      MF_TOKEN_URL: api.tokenUrl,
    });
    const result = await c.callTool({ name: "get_office", arguments: {} });
    expect(result.isError, textOf(result)).toBeFalsy();
    const [tokenReq] = api.tokenRequests();
    expect(tokenReq?.authorization).toBeUndefined();
    expect(tokenReq?.body).toMatchObject({ client_id: MOCK_CLIENT_ID, client_secret: MOCK_CLIENT_SECRET });
  });

  it("MF_ACCESS_TOKEN だけでも API を呼べる（トークン取得はしない）", async () => {
    const c = await startClient({
      MF_ACCESS_TOKEN: MOCK_STATIC_ACCESS_TOKEN,
      MF_TOKEN_FILE: "none",
      MF_API_BASE_URL: api.apiBaseUrl,
    });
    const result = await c.callTool({ name: "get_office", arguments: {} });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(api.tokenRequests()).toHaveLength(0);
  });

  it("無効なアクセストークンは 401 のエラー結果になる", async () => {
    const c = await startClient({
      MF_ACCESS_TOKEN: "wrong",
      MF_TOKEN_FILE: "none",
      MF_API_BASE_URL: api.apiBaseUrl,
    });
    const result = await c.callTool({ name: "get_office", arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("HTTP 401");
  });

  it("読み取り専用モードでは 16 ツールだけを公開し、書き込み系は呼べない", async () => {
    const c = await startClient({
      MF_ACCESS_TOKEN: MOCK_STATIC_ACCESS_TOKEN,
      MF_TOKEN_FILE: "none",
      MF_API_BASE_URL: api.apiBaseUrl,
      MF_READ_ONLY: "true",
    });
    expect((await c.listTools()).tools).toHaveLength(16);
    const result = await c.callTool({ name: "delete_partners_id", arguments: { partner_id: "P1" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("MF_READ_ONLY");
    expect(api.requests).toHaveLength(0);
  });

  it("認証情報が無くても起動し、呼び出し時に設定方法を案内する", async () => {
    const c = await startClient({ MF_TOKEN_FILE: "none", MF_API_BASE_URL: api.apiBaseUrl });
    expect((await c.listTools()).tools).toHaveLength(45);
    const result = await c.callTool({ name: "get_office", arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("MF_CLIENT_ID");
    expect(api.requests).toHaveLength(0);
  });
});

describe("E2E: コマンドライン", () => {
  it("--version でバージョンを表示する", () => {
    const res = spawnSync(process.execPath, [SERVER_ENTRY, "--version"], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe(pkg.version);
  });

  it("--help で使い方を表示する", () => {
    const res = spawnSync(process.execPath, [SERVER_ENTRY, "--help"], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("auth");
    expect(res.stdout).toContain("MF_CLIENT_ID");
  });

  it("不正な設定ではエラーを表示して終了コード 1 で終わる", () => {
    const res = spawnSync(process.execPath, [SERVER_ENTRY], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", MF_READ_ONLY: "maybe" },
      input: "",
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("MF_READ_ONLY");
  });

  it("存在しないツール名を MF_EXCLUDE_TOOLS に書くと起動しない", () => {
    const res = spawnSync(process.execPath, [SERVER_ENTRY], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", MF_EXCLUDE_TOOLS: "no_such_tool", MF_TOKEN_FILE: "none" },
      input: "",
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("no_such_tool");
  });

  it("auth はクライアント ID が無ければ設定方法を表示して終了コード 1 で終わる", () => {
    const res = spawnSync(process.execPath, [SERVER_ENTRY, "auth"], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", MF_TOKEN_FILE: "none" },
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("MF_CLIENT_ID");
  });
});
