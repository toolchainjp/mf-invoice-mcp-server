/**
 * OpenAPI 3.x の仕様書から、MCP ツール生成に必要な「操作定義」を取り出す。
 * 生成スクリプト（scripts/generate-operations.ts）とテストの両方から使う。
 */

export type JsonSchema = { [key: string]: unknown };

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** 仕様書の x-mcp.operationKind（無い場合は HTTP メソッドから決める） */
export type OperationKind = "read" | "create" | "update" | "delete";

export interface ParameterDef {
  name: string;
  in: "query" | "path";
  required: boolean;
  description?: string;
  schema: JsonSchema;
}

export interface RequestBodyDef {
  required: boolean;
  description?: string;
  schema: JsonSchema;
}

/** 仕様書の x-mcp 拡張（LLM 向けの説明） */
export interface McpHints {
  description?: string;
  useWhen?: string;
  doNotUseWhen?: string;
}

export interface OperationDef {
  operationId: string;
  /** MCP ツール名（operationId をスネークケースにしたもの） */
  toolName: string;
  method: HttpMethod;
  /** servers の /api/v3 を含まないパス（例: /partners/{partner_id}） */
  path: string;
  kind: OperationKind;
  summary: string;
  description?: string;
  mcp: McpHints;
  tags: string[];
  parameters: ParameterDef[];
  requestBody?: RequestBodyDef;
  /** 必要な OAuth スコープ */
  scopes: string[];
  /** 仕様書に記載された応答ステータス（"200", "402" など） */
  responseStatuses: string[];
}

/** 入力として扱う OpenAPI ドキュメントの最小限の形 */
export interface OpenApiDocument {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
  components?: Record<string, unknown>;
  security?: Array<Record<string, string[]>>;
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

const KIND_BY_METHOD: Record<HttpMethod, OperationKind> = {
  GET: "read",
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

/** スキーマから取り除くキー（JSON Schema として不要・非標準なもの） */
const DROP_KEYS = new Set(["example", "examples", "nullable", "xml", "externalDocs", "discriminator"]);

export function toToolName(operationId: string): string {
  return operationId
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toLowerCase();
}

/**
 * 仕様書の正規表現を JSON Schema（ECMAScript、u フラグ）で使える形にする。
 * この仕様書には Ruby 形式の正規表現が混在している:
 *   - `/.../` の区切り
 *   - `\A` / `\z`（文字列の先頭・末尾）
 *   - 所有量指定子 `*+` `++` `?+` `}+`
 * 変換しても解釈できない場合は undefined を返す（入力検証は API 側に任せる）。
 */
export function convertPattern(pattern: string): string | undefined {
  let source = pattern;
  const delimited = /^\/(.*)\/[a-z]*$/s.exec(source);
  if (delimited && source.length >= 2) source = delimited[1] ?? "";

  let out = "";
  let inClass = false;
  let afterQuantifier = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === "\\") {
      const next = source[i + 1] ?? "";
      i += 1;
      if (!inClass && next === "A") out += "^";
      else if (!inClass && (next === "z" || next === "Z")) out += "$";
      else out += ch + next;
      afterQuantifier = false;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      out += ch;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      out += ch;
      afterQuantifier = false;
      continue;
    }
    // 所有量指定子（JS には無い）は通常の量指定子として扱う
    if (ch === "+" && afterQuantifier) {
      afterQuantifier = false;
      continue;
    }
    out += ch;
    afterQuantifier = ch === "*" || ch === "+" || ch === "?" || ch === "}";
  }

  try {
    new RegExp(out, "u");
    return out;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** "#/components/schemas/Foo" 形式の参照を解決する */
function resolvePointer(doc: OpenApiDocument, ref: string): unknown {
  if (!ref.startsWith("#/")) throw new Error(`外部参照には対応していません: ${ref}`);
  let current: unknown = doc;
  for (const raw of ref.slice(2).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isObject(current) || !(key in current)) throw new Error(`参照先が見つかりません: ${ref}`);
    current = current[key];
  }
  return current;
}

/** $ref を持つオブジェクトなら参照先を返す（パラメータ・リクエストボディ用） */
function deref<T>(value: unknown, doc: OpenApiDocument): T {
  if (isObject(value) && typeof value.$ref === "string") return resolvePointer(doc, value.$ref) as T;
  return value as T;
}

/**
 * OpenAPI のスキーマを JSON Schema に変換する。
 * - $ref を展開（循環参照はエラー。3.1 の $ref と並ぶキーは参照先に上書きマージ）
 * - nullable: true（3.0 形式）を type / enum への null 追加で表現
 * - example(s) や x-* 拡張を除去
 * - pattern を JS の正規表現に変換（できなければ除去）
 */
export function convertSchema(schema: unknown, doc: OpenApiDocument, stack: string[] = []): JsonSchema {
  if (!isObject(schema)) return {};

  if (typeof schema.$ref === "string") {
    const ref = schema.$ref;
    if (stack.includes(ref))
      throw new Error(`スキーマの循環参照には対応していません: ${[...stack, ref].join(" -> ")}`);
    const target = convertSchema(resolvePointer(doc, ref), doc, [...stack, ref]);
    const { $ref: _ref, ...siblings } = schema;
    return Object.keys(siblings).length ? { ...target, ...convertSchema(siblings, doc, stack) } : target;
  }

  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (DROP_KEYS.has(key) || key.startsWith("x-")) continue;
    switch (key) {
      case "properties":
        out.properties = Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([name, sub]) => [
            name,
            convertSchema(sub, doc, stack),
          ]),
        );
        break;
      case "items":
      case "not":
        out[key] = convertSchema(value, doc, stack);
        break;
      case "additionalProperties":
        out[key] = isObject(value) ? convertSchema(value, doc, stack) : value;
        break;
      case "allOf":
      case "anyOf":
      case "oneOf":
        out[key] = (value as unknown[]).map((sub) => convertSchema(sub, doc, stack));
        break;
      case "pattern": {
        const converted = typeof value === "string" ? convertPattern(value) : undefined;
        if (converted !== undefined) out.pattern = converted;
        break;
      }
      default:
        out[key] = value;
    }
  }

  if (schema.nullable === true) {
    if (typeof out.type === "string") {
      out.type = [out.type, "null"];
      if (Array.isArray(out.enum) && !out.enum.includes(null)) out.enum = [...out.enum, null];
    } else if (out.type === undefined) {
      return { anyOf: [out, { type: "null" }] };
    }
  }
  return out;
}

function extractScopes(requirements: Array<Record<string, string[]>> | undefined): string[] {
  const scopes = new Set<string>();
  for (const requirement of requirements ?? []) {
    for (const values of Object.values(requirement)) values.forEach((v) => scopes.add(v));
  }
  return [...scopes];
}

interface RawMcp {
  operationKind?: string;
  description?: string;
  useWhen?: string;
  doNotUseWhen?: string;
}

interface RawParameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: unknown;
  "x-mcp"?: { description?: string };
}

/** 文中の operationId（例: get-partners）をツール名（get_partners）に置き換える関数 */
type Rewriter = (text: string) => string;

function extractParameter(
  raw: unknown,
  doc: OpenApiDocument,
  where: string,
  rewrite: Rewriter,
): ParameterDef {
  const p = deref<RawParameter>(raw, doc);
  if (p.in !== "query" && p.in !== "path") {
    throw new Error(`${where}: ${p.in} パラメータ（${p.name}）には対応していません`);
  }
  const param: ParameterDef = {
    name: p.name,
    in: p.in,
    required: p.in === "path" ? true : p.required === true,
    schema: convertSchema(p.schema, doc),
  };
  const description = p["x-mcp"]?.description ?? p.description;
  if (description) param.description = rewrite(description.trim());
  return param;
}

interface RawRequestBody {
  required?: boolean;
  description?: string;
  content?: Record<string, { schema?: unknown }>;
}

function extractRequestBody(raw: unknown, doc: OpenApiDocument, where: string): RequestBodyDef {
  const body = deref<RawRequestBody>(raw, doc);
  const media = body.content?.["application/json"];
  if (!media) {
    throw new Error(`${where}: application/json 以外のリクエストボディには対応していません`);
  }
  const def: RequestBodyDef = { required: body.required === true, schema: convertSchema(media.schema, doc) };
  if (body.description) def.description = body.description.trim();
  return def;
}

interface RawOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, string[]>>;
  "x-mcp"?: RawMcp;
}

function isKind(value: unknown): value is OperationKind {
  return value === "read" || value === "create" || value === "update" || value === "delete";
}

function eachOperation(
  doc: OpenApiDocument,
  fn: (path: string, method: HttpMethod, raw: RawOperation) => void,
) {
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const raw = item[method] as RawOperation | undefined;
      if (raw) fn(path, method.toUpperCase() as HttpMethod, raw);
    }
  }
}

export function extractOperations(doc: OpenApiDocument): OperationDef[] {
  // 説明文中の operationId をツール名に置き換えるため、先に全操作の対応表を作る
  const toolNames = new Map<string, string>();
  eachOperation(doc, (path, method, raw) => {
    if (!raw.operationId) throw new Error(`${method} ${path}: operationId がありません`);
    toolNames.set(raw.operationId, toToolName(raw.operationId));
  });
  const rewrite: Rewriter = (text) => text.replace(/[A-Za-z][A-Za-z0-9_-]*/g, (w) => toolNames.get(w) ?? w);

  const operations: OperationDef[] = [];
  eachOperation(doc, (path, method, raw) => {
    const where = `${method} ${path}`;
    const operationId = raw.operationId!;

    // パスレベルのパラメータに操作レベルのものを上書きマージ
    const shared = (doc.paths[path]?.parameters as unknown[] | undefined) ?? [];
    const params = new Map<string, ParameterDef>();
    for (const p of [...shared, ...(raw.parameters ?? [])]) {
      const def = extractParameter(p, doc, where, rewrite);
      params.set(`${def.in}:${def.name}`, def);
    }

    const rawMcp = raw["x-mcp"] ?? {};
    const mcp: McpHints = {};
    if (rawMcp.description) mcp.description = rewrite(rawMcp.description.trim());
    if (rawMcp.useWhen) mcp.useWhen = rewrite(rawMcp.useWhen.trim());
    if (rawMcp.doNotUseWhen) mcp.doNotUseWhen = rewrite(rawMcp.doNotUseWhen.trim());

    const op: OperationDef = {
      operationId,
      toolName: toolNames.get(operationId)!,
      method,
      path,
      kind: isKind(rawMcp.operationKind) ? rawMcp.operationKind : KIND_BY_METHOD[method],
      summary: raw.summary?.trim() || operationId,
      mcp,
      tags: raw.tags ?? [],
      parameters: [...params.values()],
      scopes: extractScopes(raw.security ?? doc.security),
      responseStatuses: Object.keys(raw.responses ?? {}),
    };
    if (raw.description) op.description = raw.description.trim();
    if (raw.requestBody) op.requestBody = extractRequestBody(raw.requestBody, doc, where);
    operations.push(op);
  });
  return operations;
}

/** src/generated/operations.ts の中身を生成する */
export function renderOperationsModule(operations: OperationDef[]): string {
  return [
    "// このファイルは scripts/generate-operations.ts が document.yaml から生成しています。直接編集しないでください。",
    "// 再生成: npm run generate",
    'import type { OperationDef } from "../openapi/convert.js";',
    "",
    `export const operations: readonly OperationDef[] = ${JSON.stringify(operations, null, 2)};`,
    "",
  ].join("\n");
}
