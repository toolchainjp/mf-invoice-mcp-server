/** 操作定義（OperationDef）を MCP ツールに変換し、入力検証と実行を行う */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import addFormatsModule from "ajv-formats";
import { MfApiError, buildRequest, type ApiRequest, type ApiResponse } from "./client.js";
import { ConfigError } from "./config.js";
import type { JsonSchema, OperationDef, OperationKind } from "./openapi/convert.js";
import { AUTH_COMMAND } from "./version.js";

// ajv-formats は CommonJS のため、NodeNext 解決では default が二重になる場合がある
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as typeof addFormatsModule.default;

export interface ToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties: false;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: ToolInputSchema;
  annotations: ToolAnnotations;
}

const KIND_HINTS: Record<OperationKind, Omit<ToolAnnotations, "title" | "openWorldHint">> = {
  read: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  create: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  update: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  delete: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
};

/** 仕様書に 402 Payment Required がある操作（郵送依頼など）は料金が発生しうる */
export function mayIncurCharges(op: OperationDef): boolean {
  return op.responseStatuses.includes("402");
}

export function buildDescription(op: OperationDef): string {
  const parts = [op.mcp.description ?? op.description ?? op.summary];
  if (op.mcp.useWhen) parts.push(`使う場面: ${op.mcp.useWhen}`);
  if (op.mcp.doNotUseWhen) parts.push(`使わない場面: ${op.mcp.doNotUseWhen}`);
  parts.push(`HTTP: ${op.method} ${op.path}`);
  if (op.scopes.length) parts.push(`必要なスコープ: ${op.scopes.join(", ")}`);
  if (op.kind !== "read") {
    parts.push(
      "注意: マネーフォワード クラウド請求書のデータを変更します。実行前に利用者へ内容を確認してください。",
    );
  }
  if (mayIncurCharges(op)) {
    parts.push(
      "注意: 郵送料などの料金が発生する場合があります（HTTP 402 Payment Required を返すことがあります）。",
    );
  }
  return parts.join("\n\n");
}

export function buildInputSchema(op: OperationDef): ToolInputSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const param of op.parameters) {
    const description = param.description ?? (param.schema.description as string | undefined);
    properties[param.name] = { ...param.schema, ...(description ? { description } : {}) };
    if (param.required) required.push(param.name);
  }

  if (op.requestBody) {
    const description = op.requestBody.description ?? "リクエストボディ（JSON）";
    properties.body = { ...op.requestBody.schema, description };
    // 仕様書はリクエストボディ自体を必須にしていないが、必須項目を持つボディは省略できない
    const bodyRequired = op.requestBody.schema.required;
    if (op.requestBody.required || (Array.isArray(bodyRequired) && bodyRequired.length))
      required.push("body");
  }

  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

export function buildToolDefinition(op: OperationDef): ToolDefinition {
  return {
    name: op.toolName,
    title: op.summary,
    description: buildDescription(op),
    inputSchema: buildInputSchema(op),
    annotations: { title: op.summary, ...KIND_HINTS[op.kind], openWorldHint: true },
  };
}

function collectFormats(schema: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) schema.forEach((s) => collectFormats(s, out));
  else if (typeof schema === "object" && schema !== null) {
    for (const [key, value] of Object.entries(schema)) {
      if (key === "format" && typeof value === "string") out.add(value);
      else collectFormats(value, out);
    }
  }
  return out;
}

function formatError(e: ErrorObject): string {
  const where = e.instancePath ? e.instancePath.slice(1).replace(/\//g, ".") : "引数";
  const p = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case "required":
      return `${where}: 必須項目 ${String(p.missingProperty)} がありません`;
    case "additionalProperties":
      return `${where}: 未定義の項目 ${String(p.additionalProperty)} は指定できません`;
    case "type":
      return `${where}: 型が違います（期待: ${String(p.type)}）`;
    case "enum":
      return `${where}: 次のいずれかを指定してください: ${(p.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(", ")}`;
    case "format":
      return `${where}: ${String(p.format)} 形式で指定してください（例: date は YYYY-MM-DD）`;
    case "pattern":
      return `${where}: 形式が違います（正規表現: ${String(p.pattern)}）`;
    case "minimum":
    case "maximum":
    case "exclusiveMinimum":
    case "exclusiveMaximum":
      return `${where}: ${String(p.comparison)} ${String(p.limit)} の範囲で指定してください`;
    case "minLength":
      return `${where}: ${String(p.limit)} 文字以上で指定してください`;
    case "maxLength":
      return `${where}: ${String(p.limit)} 文字以内で指定してください`;
    case "maxItems":
      return `${where}: ${String(p.limit)} 件以内で指定してください`;
    default:
      return `${where}: ${e.message ?? e.keyword}`;
  }
}

export interface RegisteredTool {
  definition: ToolDefinition;
  operation: OperationDef;
}

export type HiddenReason = "readOnly" | "excluded";

export interface ToolRegistryOptions {
  /** true なら kind が read のツールだけを公開する */
  readOnly?: boolean;
  /** 公開しないツール名 */
  exclude?: readonly string[];
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly hidden = new Map<string, HiddenReason>();
  private readonly validators = new Map<string, ValidateFunction>();
  private readonly ajv: Ajv;

  constructor(operations: readonly OperationDef[], options: ToolRegistryOptions = {}) {
    const exclude = new Set(options.exclude ?? []);
    const unknown = [...exclude].filter((name) => !operations.some((op) => op.toolName === name));
    if (unknown.length) {
      throw new ConfigError(
        `MF_EXCLUDE_TOOLS に存在しないツール名があります: ${unknown.join(", ")}（ツール名は docs/tools.md を参照）`,
      );
    }

    for (const op of operations) {
      if (exclude.has(op.toolName)) {
        this.hidden.set(op.toolName, "excluded");
        continue;
      }
      if (options.readOnly && op.kind !== "read") {
        this.hidden.set(op.toolName, "readOnly");
        continue;
      }
      if (this.tools.has(op.toolName)) throw new Error(`ツール名が重複しています: ${op.toolName}`);
      this.tools.set(op.toolName, { definition: buildToolDefinition(op), operation: op });
    }

    this.ajv = new Ajv({ allErrors: true, strict: false, logger: false });
    addFormats(this.ajv);
    // 仕様書に未知の format があってもコンパイルできるよう、未知の format は検証しない
    for (const format of collectFormats(operations)) {
      if (!this.ajv.formats[format]) this.ajv.addFormat(format, true);
    }
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /** 非公開にしたツールなら理由を返す */
  hiddenReason(name: string): HiddenReason | undefined {
    return this.hidden.get(name);
  }

  /** 入力を検証し、エラーメッセージの配列を返す（空なら妥当） */
  validate(name: string, args: unknown): string[] {
    const tool = this.tools.get(name);
    if (!tool) return [`ツール ${name} はありません`];
    let validator = this.validators.get(name);
    if (!validator) {
      validator = this.ajv.compile(tool.definition.inputSchema);
      this.validators.set(name, validator);
    }
    return validator(args ?? {}) ? [] : (validator.errors ?? []).map(formatError);
  }
}

export interface ToolContext {
  registry: ToolRegistry;
  client: { request(req: ApiRequest): Promise<ApiResponse> };
}

function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function describeApiError(err: MfApiError, op: OperationDef): string {
  const hints: string[] = [];
  switch (err.status) {
    case 400:
    case 422:
      hints.push("入力内容を確認してください。");
      break;
    case 401:
      hints.push(
        `認証に失敗しました。アクセストークンが有効か確認してください（リフレッシュトークンが失効している場合は \`${AUTH_COMMAND}\` を再実行）。`,
      );
      break;
    case 402:
      hints.push(
        "料金の支払い（郵送料など）が必要です。クラウド請求書の契約・支払い設定を確認してください。",
      );
      break;
    case 403:
      hints.push(
        `権限が不足しています。この操作に必要なスコープ: ${op.scopes.join(", ") || "（仕様書に記載なし）"}。アクセストークンのスコープを確認してください。`,
      );
      break;
    case 404:
      hints.push("対象が見つかりません。ID が正しいか、一覧系のツールで確認してください。");
      break;
    case 429:
      hints.push(
        `レート制限に達しました。${err.retryAfter ? `${err.retryAfter} 秒ほど待ってから` : "しばらく待ってから"}再実行してください。`,
      );
      break;
  }
  return [err.message, ...hints].join("\n");
}

export async function executeTool(ctx: ToolContext, name: string, args: unknown): Promise<CallToolResult> {
  const tool = ctx.registry.get(name);
  if (!tool) {
    const reason = ctx.registry.hiddenReason(name);
    return textResult(
      reason === "readOnly"
        ? `ツール ${name} は読み取り専用モード（MF_READ_ONLY=true）のため使用できません`
        : reason === "excluded"
          ? `ツール ${name} はサーバー設定（MF_EXCLUDE_TOOLS）で無効化されています`
          : `ツール ${name} はありません`,
      true,
    );
  }

  const errors = ctx.registry.validate(name, args);
  if (errors.length) {
    return textResult(`入力が不正です（${name}）:\n${errors.map((e) => `- ${e}`).join("\n")}`, true);
  }

  try {
    const request = buildRequest(tool.operation, (args ?? {}) as Record<string, unknown>);
    const response = await ctx.client.request(request);
    if (response.data === null || response.data === "") {
      return textResult(`成功しました（HTTP ${response.status}、レスポンスボディなし）`);
    }
    return textResult(
      typeof response.data === "string" ? response.data : JSON.stringify(response.data, null, 2),
    );
  } catch (err) {
    if (err instanceof MfApiError) return textResult(describeApiError(err, tool.operation), true);
    return textResult(`エラー: ${(err as Error).message ?? String(err)}`, true);
  }
}
