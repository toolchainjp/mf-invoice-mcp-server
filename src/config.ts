/** 環境変数から設定を読み込む */
import { homedir } from "node:os";
import { defaultTokenFile } from "./token-store.js";

export const DEFAULT_API_BASE_URL = "https://invoice.moneyforward.com/api/v3";
export const DEFAULT_TOKEN_URL = "https://api.biz.moneyforward.com/token";
export const DEFAULT_AUTHORIZE_URL = "https://api.biz.moneyforward.com/authorize";
export const DEFAULT_REDIRECT_URI = "http://localhost:8765/callback";
export const DEFAULT_SCOPES = "mfc/invoice/data.read mfc/invoice/data.write";
export const DEFAULT_TIMEOUT_MS = 30_000;

export type TokenAuthMethod = "client_secret_basic" | "client_secret_post";
const TOKEN_AUTH_METHODS: readonly TokenAuthMethod[] = ["client_secret_basic", "client_secret_post"];

export interface Config {
  /** 取得済みのアクセストークン（そのまま Bearer で使う。更新は利用者側） */
  accessToken: string | undefined;
  /** アプリポータルで作成したアプリのクライアント ID / シークレット */
  clientId: string | undefined;
  clientSecret: string | undefined;
  /** リフレッシュトークン（トークンファイルに保存済みのものがあればそちらを優先） */
  refreshToken: string | undefined;
  /** トークンの保存先。undefined なら保存しない（MF_TOKEN_FILE=none） */
  tokenFile: string | undefined;
  /** トークンエンドポイントでのクライアント認証方式 */
  tokenAuthMethod: TokenAuthMethod;
  apiBaseUrl: string;
  tokenUrl: string;
  authorizeUrl: string;
  /** auth コマンドの受け口。アプリポータルに登録したリダイレクト URI と完全に一致させる */
  redirectUri: string;
  /** auth コマンドで要求するスコープ（空白区切り） */
  scopes: string;
  /** true なら参照系のツールだけを公開する */
  readOnly: boolean;
  /** 公開しないツール名 */
  excludeTools: string[];
  timeoutMs: number;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

type Env = Record<string, string | undefined>;

function read(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function readUrl(env: Env, key: string, fallback: string, { stripSlash = true } = {}): string {
  const value = read(env, key) ?? fallback;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${key} が URL として解釈できません: ${value}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ConfigError(`${key} は http(s) の URL を指定してください: ${value}`);
  }
  return stripSlash ? value.replace(/\/+$/, "") : value;
}

function readBoolean(env: Env, key: string): boolean {
  const value = read(env, key)?.toLowerCase();
  if (value === undefined) return false;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new ConfigError(`${key} は true / false で指定してください: ${value}`);
}

function readPositiveInt(env: Env, key: string, fallback: number): number {
  const value = read(env, key);
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0)
    throw new ConfigError(`${key} は正の整数（ミリ秒）で指定してください: ${value}`);
  return n;
}

function readList(env: Env, key: string): string[] {
  return (read(env, key) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function readTokenAuthMethod(env: Env): TokenAuthMethod {
  const value = read(env, "MF_TOKEN_AUTH_METHOD") ?? "client_secret_basic";
  if (!(TOKEN_AUTH_METHODS as readonly string[]).includes(value)) {
    throw new ConfigError(
      `MF_TOKEN_AUTH_METHOD は ${TOKEN_AUTH_METHODS.join(" / ")} のどちらかです: ${value}`,
    );
  }
  return value as TokenAuthMethod;
}

function readTokenFile(env: Env, home: string): string | undefined {
  const value = read(env, "MF_TOKEN_FILE");
  if (value?.toLowerCase() === "none") return undefined;
  return value ?? defaultTokenFile(env, home);
}

export function loadConfig(env: Env = process.env, options: { homedir?: string } = {}): Config {
  return {
    accessToken: read(env, "MF_ACCESS_TOKEN"),
    clientId: read(env, "MF_CLIENT_ID"),
    clientSecret: read(env, "MF_CLIENT_SECRET"),
    refreshToken: read(env, "MF_REFRESH_TOKEN"),
    tokenFile: readTokenFile(env, options.homedir ?? homedir()),
    tokenAuthMethod: readTokenAuthMethod(env),
    apiBaseUrl: readUrl(env, "MF_API_BASE_URL", DEFAULT_API_BASE_URL),
    tokenUrl: readUrl(env, "MF_TOKEN_URL", DEFAULT_TOKEN_URL),
    authorizeUrl: readUrl(env, "MF_AUTHORIZE_URL", DEFAULT_AUTHORIZE_URL),
    redirectUri: readUrl(env, "MF_REDIRECT_URI", DEFAULT_REDIRECT_URI, { stripSlash: false }),
    scopes: read(env, "MF_SCOPES") ?? DEFAULT_SCOPES,
    readOnly: readBoolean(env, "MF_READ_ONLY"),
    excludeTools: readList(env, "MF_EXCLUDE_TOOLS"),
    timeoutMs: readPositiveInt(env, "MF_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
  };
}
