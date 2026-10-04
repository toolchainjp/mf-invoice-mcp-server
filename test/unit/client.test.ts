import { describe, expect, it, vi } from "vitest";
import type { TokenProvider } from "../../src/auth.js";
import {
  MfApiError,
  MfInvoiceClient,
  buildRequest,
  buildUrl,
  extractErrorMessages,
} from "../../src/client.js";
import { operations } from "../../src/generated/operations.js";
import type { OperationDef } from "../../src/openapi/convert.js";
import { createFetchMock, jsonResponse } from "../helpers/fetch-mock.js";

function op(toolName: string): OperationDef {
  const found = operations.find((o) => o.toolName === toolName);
  if (!found) throw new Error(`${toolName} がありません`);
  return found;
}

function tokenProvider(tokens: string[], canRefresh = true): TokenProvider & { invalidate: ReturnType<typeof vi.fn> } {
  let i = 0;
  return {
    canRefresh,
    getToken: vi.fn(async () => tokens[Math.min(i, tokens.length - 1)]!),
    invalidate: vi.fn(() => {
      i += 1;
    }),
  };
}

const BASE = "https://invoice.example.test/api/v3";

describe("buildRequest", () => {
  it("パスパラメータを埋め込み、URL 用にエンコードする", () => {
    expect(
      buildRequest(op("get_partners_partner_id_departments_id"), { partner_id: "a/b c", department_id: "D1" }),
    ).toEqual({ method: "GET", path: "/partners/a%2Fb%20c/departments/D1", query: {} });
  });

  it("指定されたクエリだけを送る（undefined / null は送らない）", () => {
    expect(
      buildRequest(op("get_billings"), { page: 2, from: "2026-01-01", to: undefined, q: null }),
    ).toEqual({ method: "GET", path: "/billings", query: { page: 2, from: "2026-01-01" } });
  });

  it("ボディはリクエストボディを持つ操作のときだけ付ける", () => {
    expect(buildRequest(op("post_partners"), { body: { name: "A" } })).toEqual({
      method: "POST",
      path: "/partners",
      query: {},
      body: { name: "A" },
    });
    expect(buildRequest(op("get_office"), { body: { name: "A" } })).toEqual({
      method: "GET",
      path: "/office",
      query: {},
    });
  });

  it("パスパラメータが無ければエラー", () => {
    expect(() => buildRequest(op("get_partners_id"), {})).toThrow(/partner_id/);
  });
});

describe("buildUrl", () => {
  it("ベース URL とパスを結合し、クエリをエンコードする", () => {
    expect(buildUrl(`${BASE}/`, "/partners", { name: "株式会社A,B", page: 1, flag: true })).toBe(
      `${BASE}/partners?name=${encodeURIComponent("株式会社A,B")}&page=1&flag=true`,
    );
  });

  it("クエリが無ければ ? を付けない", () => {
    expect(buildUrl(BASE, "/office", {})).toBe(`${BASE}/office`);
  });
});

describe("extractErrorMessages", () => {
  it.each([
    [{ errors: [{ code: "E1", message: "名前は必須です" }] }, ["[E1] 名前は必須です"]],
    [{ errors: [{ message: "名前は必須です" }, { message: "コードが重複しています" }] }, ["名前は必須です", "コードが重複しています"]],
    [{ errors: { name: ["を入力してください"], code: "は不正です" } }, ["name: を入力してください", "code: は不正です"]],
    [{ errors: ["A", "B"] }, ["A", "B"]],
    [{ errors: "まとめてのエラー" }, ["まとめてのエラー"]],
    [{ error: "invalid_token", error_description: "The access token expired" }, ["invalid_token: The access token expired"]],
    [{ message: "Not Found" }, ["Not Found"]],
    ["<html>Bad Gateway</html>", ["<html>Bad Gateway</html>"]],
    [null, []],
    [{ unknown: 1 }, ['{"unknown":1}']],
  ])("%j → %j", (body, expected) => {
    expect(extractErrorMessages(body)).toEqual(expected);
  });

  it("長い本文は切り詰める", () => {
    expect(extractErrorMessages("x".repeat(2000))[0]!.length).toBeLessThanOrEqual(501);
  });
});

describe("MfApiError", () => {
  it("ステータスとメッセージをまとめたメッセージを持つ", () => {
    const err = new MfApiError({ status: 400, body: { errors: [{ message: "名前は必須です" }] } });
    expect(err.message).toBe("マネーフォワード クラウド請求書 API がエラーを返しました（HTTP 400）\n- 名前は必須です");
    expect(err.messages).toEqual(["名前は必須です"]);
  });
});

describe("MfInvoiceClient", () => {
  it("Bearer トークン・Accept・User-Agent を付けて GET する", async () => {
    const mock = createFetchMock(() => jsonResponse({ id: "OFFICE1" }));
    const client = new MfInvoiceClient({
      baseUrl: BASE,
      tokenProvider: tokenProvider(["tok-1"]),
      fetch: mock.fetch,
      userAgent: "ua/1.0",
    });
    const res = await client.request({ method: "GET", path: "/office", query: {} });
    expect(res).toEqual({ status: 200, data: { id: "OFFICE1" } });
    expect(mock.calls[0]).toMatchObject({
      url: `${BASE}/office`,
      method: "GET",
      headers: { authorization: "Bearer tok-1", accept: "application/json", "user-agent": "ua/1.0" },
      body: undefined,
    });
    expect(mock.calls[0]?.headers["content-type"]).toBeUndefined();
  });

  it("ボディは JSON で送る", async () => {
    const mock = createFetchMock(() => jsonResponse({ id: "P1" }, 201));
    const client = new MfInvoiceClient({ baseUrl: BASE, tokenProvider: tokenProvider(["t"]), fetch: mock.fetch });
    const res = await client.request({ method: "POST", path: "/partners", query: {}, body: { name: "A" } });
    expect(res.status).toBe(201);
    expect(mock.calls[0]?.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(mock.calls[0]?.body ?? "")).toEqual({ name: "A" });
  });

  it("204 はデータ null として返す", async () => {
    const mock = createFetchMock(() => new Response(null, { status: 204 }));
    const client = new MfInvoiceClient({ baseUrl: BASE, tokenProvider: tokenProvider(["t"]), fetch: mock.fetch });
    expect(await client.request({ method: "DELETE", path: "/partners/P1", query: {} })).toEqual({
      status: 204,
      data: null,
    });
  });

  it("JSON でない成功レスポンスは文字列として返す", async () => {
    const mock = createFetchMock(() => new Response("ok", { status: 200 }));
    const client = new MfInvoiceClient({ baseUrl: BASE, tokenProvider: tokenProvider(["t"]), fetch: mock.fetch });
    expect((await client.request({ method: "GET", path: "/office", query: {} })).data).toBe("ok");
  });

  it("2xx 以外は MfApiError（Retry-After 付き）に変換する", async () => {
    const mock = createFetchMock(() =>
      jsonResponse({ errors: [{ message: "Rate limit exceeded" }] }, 429, { "retry-after": "12" }),
    );
    const client = new MfInvoiceClient({ baseUrl: BASE, tokenProvider: tokenProvider(["t"]), fetch: mock.fetch });
    const err = await client.request({ method: "GET", path: "/items", query: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MfApiError);
    expect(err).toMatchObject({ status: 429, retryAfter: "12", messages: ["Rate limit exceeded"] });
  });

  it("401 を受けたらトークンを破棄して 1 回だけ再試行する", async () => {
    const mock = createFetchMock((_call, i) =>
      i === 0 ? jsonResponse({ error: "invalid_token" }, 401) : jsonResponse({ ok: true }),
    );
    const provider = tokenProvider(["old", "new"]);
    const client = new MfInvoiceClient({ baseUrl: BASE, tokenProvider: provider, fetch: mock.fetch });
    expect((await client.request({ method: "GET", path: "/office", query: {} })).data).toEqual({ ok: true });
    expect(provider.invalidate).toHaveBeenCalledTimes(1);
    expect(mock.calls.map((c) => c.headers.authorization)).toEqual(["Bearer old", "Bearer new"]);
  });

  it("再試行でも 401 ならエラーにする（無限に再試行しない）", async () => {
    const mock = createFetchMock(() => jsonResponse({ error: "invalid_token" }, 401));
    const client = new MfInvoiceClient({ baseUrl: BASE, tokenProvider: tokenProvider(["a", "b"]), fetch: mock.fetch });
    await expect(client.request({ method: "GET", path: "/office", query: {} })).rejects.toMatchObject({ status: 401 });
    expect(mock.calls).toHaveLength(2);
  });

  it("トークンを更新できない方式（固定トークン）では 401 を再試行しない", async () => {
    const mock = createFetchMock(() => jsonResponse({ error: "invalid_token" }, 401));
    const provider = tokenProvider(["a"], false);
    const client = new MfInvoiceClient({ baseUrl: BASE, tokenProvider: provider, fetch: mock.fetch });
    await expect(client.request({ method: "GET", path: "/office", query: {} })).rejects.toBeInstanceOf(MfApiError);
    expect(mock.calls).toHaveLength(1);
    expect(provider.invalidate).not.toHaveBeenCalled();
  });

  it("通信エラーはメソッドとパスを含むメッセージにする", async () => {
    const mock = createFetchMock(() => {
      throw new TypeError("fetch failed");
    });
    const client = new MfInvoiceClient({ baseUrl: BASE, tokenProvider: tokenProvider(["t"]), fetch: mock.fetch });
    await expect(client.request({ method: "GET", path: "/office", query: {} })).rejects.toThrow(
      /通信に失敗しました（GET \/office）: fetch failed/,
    );
  });

  it("タイムアウトは設定値を含むメッセージにする", async () => {
    const mock = createFetchMock(() => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const client = new MfInvoiceClient({
      baseUrl: BASE,
      tokenProvider: tokenProvider(["t"]),
      fetch: mock.fetch,
      timeoutMs: 1234,
    });
    await expect(client.request({ method: "GET", path: "/office", query: {} })).rejects.toThrow(/1234ms/);
  });
});
