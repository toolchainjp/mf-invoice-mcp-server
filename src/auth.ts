/**
 * アクセストークンの提供。クラウド請求書 API は OAuth 2.0（認可コード）だけに対応している。
 * - リフレッシュトークン: https://api.biz.moneyforward.com/token でアクセストークン（有効 1 時間）を取得し、
 *   期限 5 分前まで再利用する。新しいリフレッシュトークンが返ればトークンファイルに保存する
 * - アクセストークン: 指定された値をそのまま使う（更新は利用者側）
 */
import { ConfigError, type Config, type TokenAuthMethod } from "./config.js";
import { FileTokenStore, type StoredToken, type TokenStore } from "./token-store.js";
import { AUTH_COMMAND } from "./version.js";

export type { TokenStore } from "./token-store.js";

export interface TokenProvider {
  /** API 呼び出しに使う Bearer トークンを返す */
  getToken(): Promise<string>;
  /** キャッシュ済みのトークンを破棄する（401 を受けたとき） */
  invalidate(): void;
  /** invalidate() 後に新しいトークンを取り直せるか */
  readonly canRefresh: boolean;
}

export class AuthError extends Error {
  override name = "AuthError";
  /** トークンエンドポイントの HTTP ステータス */
  readonly status: number | undefined;
  /** OAuth のエラーコード（invalid_grant など） */
  readonly code: string | undefined;

  constructor(message: string, options: { status?: number; code?: string; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.status = options.status;
    this.code = options.code;
  }
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  /** 秒 */
  expires_in: number;
  scope?: string;
}

export interface RequestTokenOptions {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  authMethod: TokenAuthMethod;
  params: Record<string, string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** application/x-www-form-urlencoded のエンコード（RFC 6749 2.3.1 で Basic 認証の前に必要） */
function formEncode(value: string): string {
  return new URLSearchParams({ v: value }).toString().slice(2);
}

/** トークンエンドポイントを呼ぶ（refresh_token / authorization_code グラント共通） */
export async function requestToken(options: RequestTokenOptions): Promise<TokenResponse> {
  const fetchImpl = options.fetch ?? fetch;
  const body = new URLSearchParams(options.params);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (options.authMethod === "client_secret_basic") {
    const credentials = `${formEncode(options.clientId)}:${formEncode(options.clientSecret)}`;
    headers.Authorization = `Basic ${Buffer.from(credentials).toString("base64")}`;
  } else {
    body.set("client_id", options.clientId);
    body.set("client_secret", options.clientSecret);
  }

  let res: Response;
  try {
    res = await fetchImpl(options.tokenUrl, {
      method: "POST",
      headers,
      body: body.toString(),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
  } catch (err) {
    throw new AuthError(`トークンの取得で通信に失敗しました: ${(err as Error).message}`, { cause: err });
  }

  const text = await res.text().catch(() => "");
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (typeof parsed === "object" && parsed !== null) data = parsed as Record<string, unknown>;
  } catch {
    // JSON でない応答はメッセージに本文をそのまま入れる
  }

  if (!res.ok) {
    const code = typeof data.error === "string" ? data.error : undefined;
    const description = typeof data.error_description === "string" ? data.error_description : undefined;
    const detail = [code, description].filter(Boolean).join(": ") || text.slice(0, 300);
    throw new AuthError(`トークンの取得に失敗しました（HTTP ${res.status}${detail ? ` ${detail}` : ""}）`, {
      status: res.status,
      ...(code ? { code } : {}),
    });
  }

  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new AuthError("トークンエンドポイントの応答に access_token がありません");
  }
  const expiresIn = typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 3600;
  return {
    access_token: data.access_token,
    expires_in: expiresIn,
    ...(typeof data.refresh_token === "string" && data.refresh_token
      ? { refresh_token: data.refresh_token }
      : {}),
    ...(typeof data.scope === "string" ? { scope: data.scope } : {}),
  };
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface RefreshTokenProviderOptions {
  clientId: string;
  clientSecret: string;
  /** 環境変数で渡されたリフレッシュトークン（ストアに保存済みの値が優先） */
  refreshToken?: string | undefined;
  tokenUrl: string;
  authMethod: TokenAuthMethod;
  store?: TokenStore | undefined;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  /** 致命的でない問題（トークンファイルに保存できないなど）の通知先 */
  onWarning?: (message: string) => void;
}

export class RefreshTokenProvider implements TokenProvider {
  readonly canRefresh = true;
  private readonly options: RefreshTokenProviderOptions;
  private readonly now: () => number;
  private stored: StoredToken | undefined;
  private cached: { token: string; expiresAt: number } | undefined;
  private pending: Promise<string> | undefined;

  constructor(options: RefreshTokenProviderOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    const loaded = options.store?.load();
    // 別のアプリで発行したトークンは使わない
    if (loaded && (!loaded.client_id || loaded.client_id === options.clientId)) {
      this.stored = loaded;
      if (loaded.access_token && loaded.expires_at) {
        this.cached = { token: loaded.access_token, expiresAt: loaded.expires_at };
      }
    }
  }

  async getToken(): Promise<string> {
    if (this.cached && this.now() < this.cached.expiresAt - REFRESH_MARGIN_MS) return this.cached.token;
    // 同時呼び出しで取得が重複しないよう、進行中の取得を共有する
    this.pending ??= this.refresh().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  invalidate(): void {
    this.cached = undefined;
  }

  private async refresh(): Promise<string> {
    const candidates = [
      ...new Set([this.stored?.refresh_token, this.options.refreshToken].filter((t): t is string => !!t)),
    ];
    if (!candidates.length) {
      throw new ConfigError(
        `リフレッシュトークンがありません。\`${AUTH_COMMAND}\` で取得するか、MF_REFRESH_TOKEN を設定してください。`,
      );
    }

    let lastError: AuthError | undefined;
    for (const refreshToken of candidates) {
      try {
        const res = await requestToken({
          tokenUrl: this.options.tokenUrl,
          clientId: this.options.clientId,
          clientSecret: this.options.clientSecret,
          authMethod: this.options.authMethod,
          params: { grant_type: "refresh_token", refresh_token: refreshToken },
          ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
          ...(this.options.timeoutMs ? { timeoutMs: this.options.timeoutMs } : {}),
        });
        this.accept(res, refreshToken);
        return res.access_token;
      } catch (err) {
        // 保存済みのトークンが失効していても、環境変数の値ならまだ使える可能性がある
        if (err instanceof AuthError && err.code === "invalid_grant") {
          lastError = err;
          continue;
        }
        if (err instanceof AuthError && (err.code === "invalid_client" || err.status === 401)) {
          throw new AuthError(
            `クライアント認証に失敗しました。MF_CLIENT_ID / MF_CLIENT_SECRET / MF_TOKEN_AUTH_METHOD（アプリポータルの設定）を確認してください。\n${err.message}`,
            { ...(err.status ? { status: err.status } : {}), ...(err.code ? { code: err.code } : {}) },
          );
        }
        throw err;
      }
    }
    throw new AuthError(
      `リフレッシュトークンが無効か期限切れです。\`${AUTH_COMMAND}\` で取得し直してください。\n${lastError?.message ?? ""}`,
      { ...(lastError?.status ? { status: lastError.status } : {}), code: "invalid_grant" },
    );
  }

  private accept(res: TokenResponse, usedRefreshToken: string): void {
    const expiresAt = this.now() + res.expires_in * 1000;
    this.cached = { token: res.access_token, expiresAt };
    this.stored = {
      client_id: this.options.clientId,
      access_token: res.access_token,
      refresh_token: res.refresh_token ?? usedRefreshToken,
      expires_at: expiresAt,
      ...(res.scope ? { scope: res.scope } : {}),
    };
    if (!this.options.store) return;
    try {
      this.options.store.save(this.stored);
    } catch (err) {
      this.options.onWarning?.(
        `トークンファイルへの保存に失敗しました（再起動後に再取得が必要になる場合があります）: ${(err as Error).message}`,
      );
    }
  }
}

export class StaticTokenProvider implements TokenProvider {
  readonly canRefresh = false;
  constructor(private readonly token: string) {}
  async getToken(): Promise<string> {
    return this.token;
  }
  invalidate(): void {}
}

/** 認証情報が無いときに使う。ツール一覧は見せつつ、呼び出し時に設定方法を案内する */
export class MissingCredentialsProvider implements TokenProvider {
  readonly canRefresh = false;
  async getToken(): Promise<string> {
    throw new ConfigError(
      "認証情報が設定されていません。環境変数 MF_CLIENT_ID・MF_CLIENT_SECRET を設定し、" +
        `\`${AUTH_COMMAND}\` でリフレッシュトークンを取得してから MCP サーバーを再起動してください` +
        "（取得済みのアクセストークンを MF_ACCESS_TOKEN に設定しても使えます）。",
    );
  }
  invalidate(): void {}
}

export interface TokenProviderDeps {
  fetch?: typeof fetch;
  /** 省略時は config.tokenFile のファイルを使う */
  store?: TokenStore;
  onWarning?: (message: string) => void;
}

export function createTokenProvider(config: Config, deps: TokenProviderDeps = {}): TokenProvider {
  const store = deps.store ?? (config.tokenFile ? new FileTokenStore(config.tokenFile) : undefined);
  if (config.clientId && config.clientSecret) {
    const stored = store?.load();
    const storedUsable = !!stored && (!stored.client_id || stored.client_id === config.clientId);
    if (config.refreshToken || storedUsable) {
      return new RefreshTokenProvider({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken: config.refreshToken,
        tokenUrl: config.tokenUrl,
        authMethod: config.tokenAuthMethod,
        store,
        timeoutMs: config.timeoutMs,
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
        ...(deps.onWarning ? { onWarning: deps.onWarning } : {}),
      });
    }
  }
  if (config.accessToken) return new StaticTokenProvider(config.accessToken);
  return new MissingCredentialsProvider();
}
