/**
 * `mf-invoice-mcp-server auth`: ローカルで OAuth 2.0 認可コードフローを実行し、リフレッシュトークンを取得する。
 *   1. ローカルに MF_REDIRECT_URI（既定 http://localhost:8765/callback）で待ち受ける
 *   2. ブラウザで認可画面を開き、利用者がアクセスを許可する
 *   3. コールバックで受け取った認可コードをトークンに交換し、トークンファイルに保存する
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { AuthError, requestToken, type TokenStore } from "./auth.js";
import { ConfigError, type Config } from "./config.js";
import type { StoredToken } from "./token-store.js";

export interface AuthorizeUrlParams {
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
  state: string;
}

export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(params.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", params.scopes);
  url.searchParams.set("state", params.state);
  return url.toString();
}

/** 既定のブラウザで URL を開く（失敗しても無視。URL は端末にも表示する） */
export function openInBrowser(url: string): void {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // ブラウザを開けない環境（コンテナなど）では URL を手で開いてもらう
  }
}

export interface AuthCommandOptions {
  /** 保存先。省略時は保存しない（呼び出し側で表示する） */
  store?: TokenStore | undefined;
  fetch?: typeof fetch;
  log?: (message: string) => void;
  /** 既定は openInBrowser */
  openBrowser?: (url: string) => void;
  /** 認可を待つ時間（既定 5 分） */
  timeoutMs?: number;
  /** 待ち受けを始めたときに呼ばれる（テスト用） */
  onAuthorizeUrl?: (authorizeUrl: string, callbackUrl: string) => void;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function page(res: ServerResponse, status: number, message: string): void {
  res
    .writeHead(status, { "content-type": "text/html; charset=utf-8", connection: "close" })
    .end(
      `<!doctype html><meta charset="utf-8"><title>mf-invoice-mcp-server</title>` +
        `<p style="font-family:sans-serif">${message}</p>`,
    );
}

export async function runAuthCommand(config: Config, options: AuthCommandOptions = {}): Promise<StoredToken> {
  const { clientId, clientSecret } = config;
  if (!clientId || !clientSecret) {
    throw new ConfigError(
      "auth には MF_CLIENT_ID と MF_CLIENT_SECRET が必要です。マネーフォワード クラウドのアプリポータルで作成したアプリの値を設定してください（docs/setup.md）。",
    );
  }
  const redirect = new URL(config.redirectUri);
  if (redirect.protocol !== "http:" || !LOOPBACK_HOSTS.has(redirect.hostname)) {
    throw new ConfigError(
      `MF_REDIRECT_URI は http://localhost:<ポート>/<パス> の形式にしてください（このコマンドがローカルで受け取るため）: ${config.redirectUri}`,
    );
  }

  const log = options.log ?? ((message: string) => console.error(message));
  const open = options.openBrowser ?? openInBrowser;
  const state = randomBytes(24).toString("base64url");
  const authorizeUrl = buildAuthorizeUrl({
    authorizeUrl: config.authorizeUrl,
    clientId,
    redirectUri: config.redirectUri,
    scopes: config.scopes,
    state,
  });

  return new Promise<StoredToken>((resolve, reject) => {
    let settled = false;
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end();
        return;
      }
      void handleCallback(url, res);
    });

    const finish = (err: unknown, token?: StoredToken) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // 応答中の接続は connection: close で閉じられるので、待機中の接続だけを閉じる
      server.close();
      server.closeIdleConnections();
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve(token!);
    };

    const handleCallback = async (url: URL, res: ServerResponse) => {
      if (url.searchParams.get("state") !== state) {
        page(res, 400, "state が一致しません。もう一度 auth コマンドからやり直してください。");
        return finish(
          new AuthError(
            "コールバックの state が一致しません（別のブラウザタブの応答か、改ざんの可能性があります）",
          ),
        );
      }
      const error = url.searchParams.get("error");
      if (error) {
        page(res, 400, `認可されませんでした: ${error}`);
        const description = url.searchParams.get("error_description");
        return finish(
          new AuthError(`認可されませんでした: ${error}${description ? ` (${description})` : ""}`),
        );
      }
      const code = url.searchParams.get("code");
      if (!code) {
        page(res, 400, "認可コードがありません。");
        return finish(new AuthError("コールバックに認可コード（code）がありません"));
      }
      try {
        const token = await requestToken({
          tokenUrl: config.tokenUrl,
          clientId,
          clientSecret,
          authMethod: config.tokenAuthMethod,
          params: { grant_type: "authorization_code", code, redirect_uri: config.redirectUri },
          timeoutMs: config.timeoutMs,
          ...(options.fetch ? { fetch: options.fetch } : {}),
        });
        if (!token.refresh_token) {
          throw new AuthError("トークンエンドポイントの応答に refresh_token がありません");
        }
        const stored: StoredToken = {
          client_id: clientId,
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: Date.now() + token.expires_in * 1000,
          ...(token.scope ? { scope: token.scope } : {}),
        };
        options.store?.save(stored);
        page(res, 200, "認可が完了しました。このウィンドウを閉じてください。");
        finish(undefined, stored);
      } catch (err) {
        page(res, 500, "トークンの取得に失敗しました。端末の表示を確認してください。");
        finish(err);
      }
    };

    const timer = setTimeout(
      () => finish(new AuthError("認可を待つ時間が過ぎました。もう一度 auth コマンドを実行してください。")),
      options.timeoutMs ?? 5 * 60 * 1000,
    );
    server.on("error", (err) =>
      finish(new Error(`${config.redirectUri} で待ち受けできません: ${(err as Error).message}`)),
    );
    server.listen(Number(redirect.port || 80), redirect.hostname.replace(/^\[|\]$/g, ""), () => {
      const { port } = server.address() as AddressInfo;
      const callbackUrl = `http://${redirect.hostname}:${port}${redirect.pathname}`;
      log(
        [
          "ブラウザでマネーフォワード クラウドにログインし、アクセスを許可してください。",
          "ブラウザが開かない場合は次の URL を開いてください:",
          "",
          `  ${authorizeUrl}`,
          "",
          `${callbackUrl} で認可の完了を待っています…`,
        ].join("\n"),
      );
      options.onAuthorizeUrl?.(authorizeUrl, callbackUrl);
      open(authorizeUrl);
    });
  });
}
