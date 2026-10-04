/** マネーフォワード クラウド請求書 API の HTTP クライアント */
import type { TokenProvider } from "./auth.js";
import type { OperationDef } from "./openapi/convert.js";

export type QueryValue = string | number | boolean;

export interface ApiRequest {
  method: OperationDef["method"];
  /** パスパラメータ埋め込み済みのパス（ベース URL の /api/v3 は含まない） */
  path: string;
  query: Record<string, QueryValue>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  /** JSON を解釈した値。ボディが無ければ null、JSON でなければ文字列 */
  data: unknown;
}

const MAX_MESSAGE_LENGTH = 500;

function truncate(text: string): string {
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH)}…` : text;
}

function stringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function formatErrorItem(item: unknown): string {
  if (typeof item === "object" && item !== null && "message" in item) {
    const { code, message } = item as { code?: unknown; message?: unknown };
    return `${code ? `[${stringify(code)}] ` : ""}${stringify(message)}`;
  }
  return stringify(item);
}

/**
 * エラー応答からメッセージを取り出す。仕様書にエラー形式の定義が無いため、よくある形をすべて受け付ける:
 * `{ errors: [{ code, message }] }` / `{ errors: { field: [...] } }` / `{ errors: "..." }` /
 * `{ error, error_description }`（OAuth）/ `{ message }` / 文字列
 */
export function extractErrorMessages(body: unknown): string[] {
  if (body === null || body === undefined || body === "") return [];
  if (typeof body === "string") return [truncate(body)];
  if (typeof body !== "object") return [String(body)];

  const b = body as Record<string, unknown>;
  const out: string[] = [];
  if (Array.isArray(b.errors)) {
    out.push(...b.errors.map(formatErrorItem));
  } else if (typeof b.errors === "string") {
    out.push(b.errors);
  } else if (typeof b.errors === "object" && b.errors !== null) {
    for (const [field, value] of Object.entries(b.errors)) {
      for (const m of Array.isArray(value) ? value : [value]) out.push(`${field}: ${stringify(m)}`);
    }
  }
  if (!out.length && typeof b.error === "string") {
    out.push(typeof b.error_description === "string" ? `${b.error}: ${b.error_description}` : b.error);
  }
  if (!out.length && typeof b.message === "string") out.push(b.message);
  if (!out.length) out.push(truncate(JSON.stringify(body)));
  return out.map(truncate);
}

export class MfApiError extends Error {
  override name = "MfApiError";
  readonly status: number;
  readonly messages: string[];
  readonly retryAfter: string | undefined;
  readonly body: unknown;

  constructor(init: { status: number; body: unknown; retryAfter?: string | undefined }) {
    const messages = extractErrorMessages(init.body);
    super(
      [
        `マネーフォワード クラウド請求書 API がエラーを返しました（HTTP ${init.status}）`,
        ...messages.map((m) => `- ${m}`),
      ].join("\n"),
    );
    this.status = init.status;
    this.messages = messages;
    this.retryAfter = init.retryAfter;
    this.body = init.body;
  }
}

/** ツール引数を HTTP リクエストに変換する */
export function buildRequest(op: OperationDef, args: Record<string, unknown>): ApiRequest {
  let path = op.path;
  const query: Record<string, QueryValue> = {};

  for (const param of op.parameters) {
    const value = args[param.name];
    if (value === undefined || value === null) {
      if (param.in === "path") throw new Error(`パスパラメータ ${param.name} が指定されていません`);
      continue;
    }
    if (param.in === "path") path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)));
    else query[param.name] = value as QueryValue;
  }

  const request: ApiRequest = { method: op.method, path, query };
  if (op.requestBody && args.body !== undefined) request.body = args.body;
  return request;
}

export function buildUrl(baseUrl: string, path: string, query: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) search.append(key, String(value));
  const qs = search.toString().replace(/\+/g, "%20");
  return `${baseUrl.replace(/\/+$/, "")}${path}${qs ? `?${qs}` : ""}`;
}

export interface ClientOptions {
  baseUrl: string;
  tokenProvider: TokenProvider;
  fetch?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
}

export class MfInvoiceClient {
  private readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl;
    this.tokenProvider = options.tokenProvider;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.userAgent = options.userAgent ?? "mf-invoice-mcp-server";
  }

  async request(req: ApiRequest): Promise<ApiResponse> {
    const res = await this.send(req);
    if (res.status === 401 && this.tokenProvider.canRefresh) {
      // アクセストークンの失効に備え、取り直して 1 回だけ再試行する
      await res.body?.cancel().catch(() => {});
      this.tokenProvider.invalidate();
      return this.handle(await this.send(req));
    }
    return this.handle(res);
  }

  private async send(req: ApiRequest): Promise<Response> {
    const token = await this.tokenProvider.getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };
    const init: RequestInit = { method: req.method, headers, signal: AbortSignal.timeout(this.timeoutMs) };
    if (req.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(req.body);
    }
    try {
      return await this.fetchImpl(buildUrl(this.baseUrl, req.path, req.query), init);
    } catch (err) {
      const reason =
        (err as Error).name === "TimeoutError"
          ? `${this.timeoutMs}ms でタイムアウトしました`
          : (err as Error).message;
      throw new Error(
        `マネーフォワード クラウド請求書 API との通信に失敗しました（${req.method} ${req.path}）: ${reason}`,
        {
          cause: err,
        },
      );
    }
  }

  private async handle(res: Response): Promise<ApiResponse> {
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (res.ok) return { status: res.status, data };
    throw new MfApiError({
      status: res.status,
      body: data,
      retryAfter: res.headers.get("retry-after") ?? undefined,
    });
  }
}
