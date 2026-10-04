import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  convertPattern,
  convertSchema,
  extractOperations,
  renderOperationsModule,
  toToolName,
  type OpenApiDocument,
  type OperationDef,
} from "../../src/openapi/convert.js";

const spec = parse(readFileSync(new URL("../../document.yaml", import.meta.url), "utf8")) as OpenApiDocument;

function find(ops: OperationDef[], operationId: string): OperationDef {
  const op = ops.find((o) => o.operationId === operationId);
  if (!op) throw new Error(`${operationId} がありません`);
  return op;
}

describe("toToolName", () => {
  it.each([
    ["get-office", "get_office"],
    ["get-partners-id", "get_partners_id"],
    ["delete-office-registration_code", "delete_office_registration_code"],
    ["put-quote-quote_id-order_status", "put_quote_quote_id_order_status"],
    ["getJournalById", "get_journal_by_id"],
  ])("%s → %s", (input, expected) => {
    expect(toToolName(input)).toBe(expected);
  });
});

describe("convertPattern（Ruby 形式の正規表現を JS に変換）", () => {
  it("JS としてそのまま使える正規表現は変えない", () => {
    expect(convertPattern("^\\d{3}-?\\d{4}$")).toBe("^\\d{3}-?\\d{4}$");
  });

  it("/.../ の区切りを外す（適格請求書発行事業者番号）", () => {
    const pattern = convertPattern("/^T\\d{13}$/");
    expect(pattern).toBe("^T\\d{13}$");
    const re = new RegExp(pattern!, "u");
    expect(re.test("T1234567890123")).toBe(true);
    expect(re.test("T123")).toBe(false);
    expect(re.test("/T1234567890123/")).toBe(false);
  });

  it("\\A / \\z を ^ / $ に、所有量指定子 *+ を * にする（電話番号）", () => {
    const pattern = convertPattern("/\\A(\\+|＋)?[0-9０-９\\-|－|ー|−]+\\s*+\\z/");
    expect(pattern).toBe("^(\\+|＋)?[0-9０-９\\-|－|ー|−]+\\s*$");
    const re = new RegExp(pattern!, "u");
    expect(re.test("03-1234-5678")).toBe(true);
    expect(re.test("＋８１－３－１２３４")).toBe(true);
    expect(re.test("03-1234-5678 ")).toBe(true);
    expect(re.test("TEL 03")).toBe(false);
  });

  it("Peppol ID の正規表現を変換する", () => {
    const pattern = convertPattern("/\\A((0088|0188):[0-9]{13}|0221:T[0-9]{13})\\z/");
    const re = new RegExp(pattern!, "u");
    expect(re.test("0188:1234567890123")).toBe(true);
    expect(re.test("0221:T1234567890123")).toBe(true);
    expect(re.test("0221:1234567890123")).toBe(false);
  });

  it("エスケープされたバックスラッシュ（\\\\A）は変換しない", () => {
    expect(convertPattern("^a\\\\A$")).toBe("^a\\\\A$");
  });

  it("文字クラス内の + は量指定子として扱わない", () => {
    expect(convertPattern("^[+]+$")).toBe("^[+]+$");
  });

  it("JS で解釈できない正規表現は undefined を返す（API 側の検証に任せる）", () => {
    expect(convertPattern("(?<!unterminated")).toBeUndefined();
  });
});

describe("convertSchema", () => {
  const doc: OpenApiDocument = {
    openapi: "3.1.0",
    paths: {},
    components: {
      schemas: {
        Leaf: { type: "string", example: "x", "x-stoplight": { id: "1" } },
        Nullable: { type: "string", nullable: true, enum: ["a", "b"] },
        Pattern: { type: "string", pattern: "/^T\\d{13}$/" },
        Loop: { type: "object", properties: { self: { $ref: "#/components/schemas/Loop" } } },
      },
    },
  };

  it("$ref を展開し、example / x-* を取り除く", () => {
    expect(
      convertSchema({ type: "object", properties: { a: { $ref: "#/components/schemas/Leaf" } } }, doc),
    ).toEqual({ type: "object", properties: { a: { type: "string" } } });
  });

  it("スキーマ内の examples（3.1 形式）も取り除く", () => {
    expect(convertSchema({ type: "string", examples: ["a"] }, doc)).toEqual({ type: "string" });
  });

  it("nullable: true を type 配列と enum への null 追加で表す", () => {
    expect(convertSchema({ $ref: "#/components/schemas/Nullable" }, doc)).toEqual({
      type: ["string", "null"],
      enum: ["a", "b", null],
    });
  });

  it("pattern を JS 形式に変換する", () => {
    expect(convertSchema({ $ref: "#/components/schemas/Pattern" }, doc)).toEqual({
      type: "string",
      pattern: "^T\\d{13}$",
    });
  });

  it("変換できない pattern は取り除く", () => {
    expect(convertSchema({ type: "string", pattern: "(?<!bad" }, doc)).toEqual({ type: "string" });
  });

  it("properties という名前のプロパティや type という名前のプロパティを壊さない", () => {
    expect(
      convertSchema({ type: "object", properties: { type: { type: "string" }, example: { type: "integer" } } }, doc),
    ).toEqual({ type: "object", properties: { type: { type: "string" }, example: { type: "integer" } } });
  });

  it("循環参照はエラーにする", () => {
    expect(() => convertSchema({ $ref: "#/components/schemas/Loop" }, doc)).toThrow(/循環参照/);
  });

  it("存在しない参照はエラーにする", () => {
    expect(() => convertSchema({ $ref: "#/components/schemas/Nope" }, doc)).toThrow(/参照先が見つかりません/);
  });
});

describe("extractOperations（document.yaml）", () => {
  const ops = extractOperations(spec);

  it("45 操作を抽出し、ツール名が重複しない", () => {
    expect(ops).toHaveLength(45);
    expect(new Set(ops.map((o) => o.toolName)).size).toBe(45);
    for (const op of ops) expect(op.toolName).toMatch(/^[a-z0-9_]+$/);
  });

  it("x-mcp.operationKind を kind に取り込む（read 16 / create 10 / update 9 / delete 10）", () => {
    const count = (kind: string) => ops.filter((o) => o.kind === kind).length;
    expect([count("read"), count("create"), count("update"), count("delete")]).toEqual([16, 10, 9, 10]);
    for (const op of ops.filter((o) => o.kind === "read")) expect(op.method).toBe("GET");
  });

  it("パスは servers の /api/v3 を含まない相対パスのまま", () => {
    const op = find(ops, "get-partners-id");
    expect(op).toMatchObject({ method: "GET", path: "/partners/{partner_id}", toolName: "get_partners_id" });
  });

  it("パスレベルのパラメータを取り込み、x-mcp.description を説明に使う", () => {
    const op = find(ops, "get-partners-id");
    expect(op.parameters).toEqual([
      {
        name: "partner_id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。",
      },
    ]);
  });

  it("x-mcp の説明文に出てくる operationId をツール名に置き換える", () => {
    const op = find(ops, "put-office-registration-code");
    expect(op.mcp.description).toContain("適格請求書発行事業者番号");
    expect(op.mcp.useWhen).toBeDefined();
    expect(op.mcp.doNotUseWhen).toBe("登録番号を削除する場合はdelete_office_registration_codeを使用。");
  });

  it("クエリパラメータ（任意）を抽出する", () => {
    const op = find(ops, "get-partners");
    expect(op.parameters.map((p) => [p.name, p.in, p.required])).toEqual([
      ["name", "query", false],
      ["code", "query", false],
      ["name_kana", "query", false],
      ["partner_pic", "query", false],
      ["office_pic", "query", false],
      ["page", "query", false],
      ["per_page", "query", false],
    ]);
    expect(op.parameters.find((p) => p.name === "per_page")?.schema).toEqual({
      type: "integer",
      minimum: 1,
      maximum: 100,
    });
  });

  it("components/requestBodies の参照を解決し、ボディのスキーマを取り込む", () => {
    const op = find(ops, "post-partners");
    expect(op.requestBody?.schema.type).toBe("object");
    expect(Object.keys((op.requestBody?.schema.properties ?? {}) as object)).toContain("name");
    expect(JSON.stringify(op.requestBody)).not.toContain("$ref");
  });

  it("インラインのリクエストボディ（登録番号）の pattern を JS 形式にする", () => {
    const op = find(ops, "put-office-registration-code");
    expect(op.requestBody?.schema).toMatchObject({
      type: "object",
      required: ["registration_code"],
      properties: { registration_code: { type: "string", pattern: "^T\\d{13}$" } },
    });
  });

  it("操作ごとの security からスコープを取り出し、無ければ文書全体の security を使う", () => {
    expect(find(ops, "put-office").scopes).toEqual(["mfc/invoice/data.write"]);
    expect(find(ops, "get-office").scopes).toEqual(["mfc/invoice/data.write", "mfc/invoice/data.read"]);
  });

  it("応答ステータスを保持する（郵送依頼は 402 を含む）", () => {
    expect(find(ops, "post-billings-billing_id-posting").responseStatuses).toContain("402");
    expect(find(ops, "get-office").responseStatuses).not.toContain("402");
  });

  it("どの操作のスキーマにも $ref・x-*・example が残らない", () => {
    const text = JSON.stringify(ops);
    expect(text).not.toContain('"$ref"');
    expect(text).not.toContain('"x-');
    expect(text).not.toContain('"example"');
    expect(text).not.toContain('"nullable"');
  });

  it("すべての pattern が JS の正規表現（u フラグ）としてコンパイルできる", () => {
    const patterns = [...JSON.stringify(ops).matchAll(/"pattern":"((?:[^"\\]|\\.)*)"/g)].map(
      (m) => JSON.parse(`"${m[1]}"`) as string,
    );
    expect(patterns.length).toBeGreaterThan(0);
    for (const p of patterns) {
      expect(() => new RegExp(p, "u")).not.toThrow();
      expect(p.startsWith("/")).toBe(false);
    }
  });
});

describe("extractOperations（エラーと補完）", () => {
  it("operationId が無い操作はエラー", () => {
    expect(() => extractOperations({ openapi: "3.1.0", paths: { "/a": { get: {} } } })).toThrow(/operationId/);
  });

  it("application/json 以外のリクエストボディはエラー", () => {
    const doc: OpenApiDocument = {
      openapi: "3.1.0",
      paths: {
        "/a": { post: { operationId: "post-a", requestBody: { content: { "text/plain": { schema: {} } } } } },
      },
    };
    expect(() => extractOperations(doc)).toThrow(/application\/json/);
  });

  it("x-mcp.operationKind が無ければ HTTP メソッドから決める", () => {
    const doc: OpenApiDocument = {
      openapi: "3.1.0",
      paths: {
        "/a": {
          get: { operationId: "get-a" },
          post: { operationId: "post-a" },
          put: { operationId: "put-a" },
          patch: { operationId: "patch-a" },
          delete: { operationId: "delete-a" },
        },
      },
    };
    expect(extractOperations(doc).map((o) => o.kind)).toEqual(["read", "create", "update", "update", "delete"]);
  });

  it("操作レベルのパラメータがパスレベルの同名パラメータを上書きする", () => {
    const doc: OpenApiDocument = {
      openapi: "3.1.0",
      paths: {
        "/a/{id}": {
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          get: {
            operationId: "get-a",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          },
        },
      },
    };
    expect(extractOperations(doc)[0]?.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "integer" } },
    ]);
  });
});

describe("renderOperationsModule", () => {
  it("生成物であることを示すヘッダーと operations の export を出力する", () => {
    const text = renderOperationsModule([]);
    expect(text).toContain("直接編集しないでください");
    expect(text).toContain("export const operations: readonly OperationDef[] = [];");
  });
});
