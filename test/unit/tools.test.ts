import { describe, expect, it, vi } from "vitest";
import { MfApiError, type ApiRequest, type ApiResponse } from "../../src/client.js";
import { operations } from "../../src/generated/operations.js";
import type { OperationDef } from "../../src/openapi/convert.js";
import { ToolRegistry, buildInputSchema, buildToolDefinition, executeTool } from "../../src/tools.js";

function op(toolName: string): OperationDef {
  const found = operations.find((o) => o.toolName === toolName);
  if (!found) throw new Error(`${toolName} がありません`);
  return found;
}

function textOf(result: { content: unknown }): string {
  return (result.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
}

function fakeClient(impl: (req: ApiRequest) => Promise<ApiResponse> | ApiResponse) {
  return { request: vi.fn(async (req: ApiRequest) => impl(req)) };
}

describe("buildToolDefinition", () => {
  it("説明に x-mcp の説明・使う場面・使わない場面・HTTP・スコープを含める", () => {
    const def = buildToolDefinition(op("put_office_registration_code"));
    expect(def.description).toContain("適格請求書発行事業者番号");
    expect(def.description).toContain("使う場面:");
    expect(def.description).toContain("使わない場面: 登録番号を削除する場合はdelete_office_registration_codeを使用。");
    expect(def.description).toContain("HTTP: PUT /office/registration_code");
    expect(def.description).toContain("mfc/invoice/data.write");
    expect(def.title).toBe("Update registration code of my office");
  });

  it("書き込み系の説明にはデータを変更する旨の注意を付け、参照系には付けない", () => {
    expect(buildToolDefinition(op("delete_partners_id")).description).toContain("データを変更します");
    expect(buildToolDefinition(op("get_partners")).description).not.toContain("データを変更します");
  });

  it("402 を返しうる操作（郵送依頼）には料金が発生しうる旨を付ける", () => {
    expect(buildToolDefinition(op("post_billings_billing_id_posting")).description).toContain("料金");
    expect(buildToolDefinition(op("post_quotes_quote_id_posting")).description).toContain("料金");
    expect(buildToolDefinition(op("post_partners")).description).not.toContain("料金");
  });

  it.each([
    ["get_office", { readOnlyHint: true, destructiveHint: false, idempotentHint: true }],
    ["post_partners", { readOnlyHint: false, destructiveHint: false, idempotentHint: false }],
    ["put_partners_id", { readOnlyHint: false, destructiveHint: true, idempotentHint: true }],
    ["delete_partners_id", { readOnlyHint: false, destructiveHint: true, idempotentHint: true }],
    // POST だが operationKind は create
    ["post_quotes_quote_id_convert_to_billing", { readOnlyHint: false, destructiveHint: false, idempotentHint: false }],
  ])("%s の注記は operationKind から決まる", (name, hints) => {
    expect(buildToolDefinition(op(name)).annotations).toMatchObject({ ...hints, openWorldHint: true });
  });
});

describe("buildInputSchema", () => {
  it("パスパラメータを必須の引数にし、未定義の引数を許さない", () => {
    expect(buildInputSchema(op("get_partners_partner_id_departments_id"))).toMatchObject({
      type: "object",
      required: ["partner_id", "department_id"],
      additionalProperties: false,
    });
  });

  it("クエリパラメータは任意の引数で、x-mcp の説明を使う", () => {
    const schema = buildInputSchema(op("get_partners"));
    expect(schema.required).toBeUndefined();
    expect(schema.properties.name).toEqual({
      type: "string",
      description: "取引先名で絞り込む。部分一致検索。カンマ区切りで複数指定可能。",
    });
  });

  it("リクエストボディは body 引数にまとめる", () => {
    const schema = buildInputSchema(op("put_office_registration_code"));
    expect(schema.properties.body).toMatchObject({
      type: "object",
      required: ["registration_code"],
    });
  });

  it("引数の無い操作は空の properties", () => {
    expect(buildInputSchema(op("get_office"))).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
  });
});

describe("ToolRegistry", () => {
  it("全 45 ツールを公開する", () => {
    expect(new ToolRegistry(operations).list()).toHaveLength(45);
  });

  it("読み取り専用モードでは read の 16 ツールだけを公開する", () => {
    const registry = new ToolRegistry(operations, { readOnly: true });
    const tools = registry.list();
    expect(tools).toHaveLength(16);
    expect(tools.every((t) => t.annotations.readOnlyHint)).toBe(true);
    expect(registry.hiddenReason("post_partners")).toBe("readOnly");
  });

  it("exclude に指定したツールを公開しない", () => {
    const registry = new ToolRegistry(operations, {
      exclude: ["post_billings_billing_id_posting", "post_quotes_quote_id_posting"],
    });
    expect(registry.list()).toHaveLength(43);
    expect(registry.get("post_billings_billing_id_posting")).toBeUndefined();
    expect(registry.hiddenReason("post_quotes_quote_id_posting")).toBe("excluded");
  });

  it("exclude に存在しないツール名があれば起動時にエラーにする（設定の打ち間違いで封じたつもりにならないように）", () => {
    expect(() => new ToolRegistry(operations, { exclude: ["post_billing_posting"] })).toThrow(
      /post_billing_posting/,
    );
  });

  it("仕様書の pattern で入力を検証する", () => {
    const registry = new ToolRegistry(operations);
    expect(
      registry.validate("put_office_registration_code", { body: { registration_code: "T1234567890123" } }),
    ).toEqual([]);
    expect(
      registry.validate("put_office_registration_code", { body: { registration_code: "1234567890123" } }),
    ).toEqual([expect.stringContaining("body.registration_code")]);
  });

  it("必須・型・未定義の引数・範囲のエラーを日本語で返す", () => {
    const registry = new ToolRegistry(operations);
    expect(registry.validate("get_partners_id", {})).toEqual([
      expect.stringContaining("必須項目 partner_id"),
    ]);
    expect(registry.validate("get_partners", { page: "1" })).toEqual([
      expect.stringContaining("page: 型が違います"),
    ]);
    expect(registry.validate("get_partners", { foo: 1 })).toEqual([expect.stringContaining("未定義の項目 foo")]);
    expect(registry.validate("get_partners", { per_page: 101 })[0]).toContain("per_page");
  });
});

describe("executeTool", () => {
  const registry = new ToolRegistry(operations);

  it("引数からリクエストを組み立てて API を呼び、JSON を整形して返す", async () => {
    const client = fakeClient(() => ({ status: 200, data: { id: "P1", name: "取引先A" } }));
    const result = await executeTool({ registry, client }, "get_partners_id", { partner_id: "P1" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(textOf(result))).toEqual({ id: "P1", name: "取引先A" });
    expect(client.request).toHaveBeenCalledWith({ method: "GET", path: "/partners/P1", query: {} });
  });

  it("ボディ付きの操作は body をそのまま送る", async () => {
    const client = fakeClient(() => ({ status: 200, data: { registration_code: "T1234567890123" } }));
    await executeTool({ registry, client }, "put_office_registration_code", {
      body: { registration_code: "T1234567890123" },
    });
    expect(client.request).toHaveBeenCalledWith({
      method: "PUT",
      path: "/office/registration_code",
      query: {},
      body: { registration_code: "T1234567890123" },
    });
  });

  it("レスポンスボディが無ければ成功メッセージを返す", async () => {
    const client = fakeClient(() => ({ status: 204, data: null }));
    const result = await executeTool({ registry, client }, "delete_partners_id", { partner_id: "P1" });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("HTTP 204");
  });

  it("入力が不正なら API を呼ばずにエラー結果を返す", async () => {
    const client = fakeClient(() => ({ status: 200, data: {} }));
    const result = await executeTool({ registry, client }, "get_partners_id", {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("入力が不正です");
    expect(client.request).not.toHaveBeenCalled();
  });

  it("存在しないツール・非公開のツールはエラー結果を返す", async () => {
    const client = fakeClient(() => ({ status: 200, data: {} }));
    expect(textOf(await executeTool({ registry, client }, "nope", {}))).toContain("ツール nope はありません");

    const readOnly = new ToolRegistry(operations, { readOnly: true });
    const r1 = await executeTool({ registry: readOnly, client }, "post_partners", {});
    expect(r1.isError).toBe(true);
    expect(textOf(r1)).toContain("MF_READ_ONLY");

    const excluded = new ToolRegistry(operations, { exclude: ["post_billings_billing_id_posting"] });
    const r2 = await executeTool({ registry: excluded, client }, "post_billings_billing_id_posting", {});
    expect(textOf(r2)).toContain("MF_EXCLUDE_TOOLS");
    expect(client.request).not.toHaveBeenCalled();
  });

  it("API エラー（402）は内容と対処のヒントを返す", async () => {
    const client = fakeClient(() => {
      throw new MfApiError({ status: 402, body: { errors: [{ message: "支払い方法が未登録です" }] } });
    });
    const result = await executeTool({ registry, client }, "post_billings_billing_id_posting", {
      billing_id: "B1",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("HTTP 402");
    expect(textOf(result)).toContain("支払い方法が未登録です");
    expect(textOf(result)).toContain("料金");
  });

  it("API エラー（429）は Retry-After を案内する", async () => {
    const client = fakeClient(() => {
      throw new MfApiError({ status: 429, body: null, retryAfter: "30" });
    });
    const result = await executeTool({ registry, client }, "get_items", {});
    expect(textOf(result)).toContain("30 秒");
  });

  it("API エラー（403）はスコープの確認を案内する", async () => {
    const client = fakeClient(() => {
      throw new MfApiError({ status: 403, body: null });
    });
    const result = await executeTool({ registry, client }, "post_partners", { body: { name: "A" } });
    expect(textOf(result)).toContain("mfc/invoice/data.write");
  });

  it("その他の例外はメッセージをエラー結果として返す", async () => {
    const client = fakeClient(() => {
      throw new Error("通信に失敗しました");
    });
    const result = await executeTool({ registry, client }, "get_office", {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("通信に失敗しました");
  });
});
