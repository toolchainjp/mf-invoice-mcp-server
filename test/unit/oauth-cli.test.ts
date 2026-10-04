import { describe, expect, it, vi } from "vitest";
import type { TokenStore } from "../../src/auth.js";
import { ConfigError, loadConfig } from "../../src/config.js";
import { buildAuthorizeUrl, runAuthCommand } from "../../src/oauth-cli.js";
import type { StoredToken } from "../../src/token-store.js";
import { createFetchMock, jsonResponse } from "../helpers/fetch-mock.js";

function memoryStore(): TokenStore & { saved: StoredToken[] } {
  const saved: StoredToken[] = [];
  return { saved, load: () => saved.at(-1), save: (t) => void saved.push(t) };
}

const config = loadConfig({
  MF_CLIENT_ID: "cid",
  MF_CLIENT_SECRET: "sec",
  MF_TOKEN_FILE: "none",
  MF_TOKEN_URL: "https://auth.example.test/token",
  MF_AUTHORIZE_URL: "https://auth.example.test/authorize",
  // テストでは空いているポートを使う
  MF_REDIRECT_URI: "http://127.0.0.1:0/callback",
});

/** runAuthCommand を起動し、認可 URL とコールバック URL が分かるまで待つ */
function start(fetchImpl: typeof fetch, store = memoryStore()) {
  let resolveUrls!: (v: { authorizeUrl: URL; callbackUrl: string }) => void;
  const urls = new Promise<{ authorizeUrl: URL; callbackUrl: string }>((r) => (resolveUrls = r));
  const log = vi.fn();
  const done = runAuthCommand(config, {
    fetch: fetchImpl,
    store,
    log,
    openBrowser: () => {},
    timeoutMs: 5_000,
    onAuthorizeUrl: (authorizeUrl, callbackUrl) =>
      resolveUrls({ authorizeUrl: new URL(authorizeUrl), callbackUrl }),
  });
  return { urls, done, store, log };
}

describe("buildAuthorizeUrl", () => {
  it("認可コードフローのパラメータを付ける", () => {
    const url = new URL(
      buildAuthorizeUrl({
        authorizeUrl: "https://api.biz.moneyforward.com/authorize",
        clientId: "cid",
        redirectUri: "http://localhost:8765/callback",
        scopes: "mfc/invoice/data.read mfc/invoice/data.write",
        state: "st",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://api.biz.moneyforward.com/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "cid",
      redirect_uri: "http://localhost:8765/callback",
      scope: "mfc/invoice/data.read mfc/invoice/data.write",
      state: "st",
    });
  });
});

describe("runAuthCommand", () => {
  it("コールバックで受け取った認可コードをトークンに交換し、ストアに保存する", async () => {
    const tokenMock = createFetchMock(() =>
      jsonResponse({
        access_token: "acc",
        refresh_token: "ref",
        expires_in: 3600,
        scope: "mfc/invoice/data.read",
      }),
    );
    const { urls, done, store } = start(tokenMock.fetch);
    const { authorizeUrl, callbackUrl } = await urls;
    expect(authorizeUrl.searchParams.get("client_id")).toBe("cid");
    const state = authorizeUrl.searchParams.get("state");
    expect(state).toMatch(/^[A-Za-z0-9_-]{20,}$/);

    // 関係ないパスは 404 にして待ち続ける
    expect((await fetch(new URL("/favicon.ico", callbackUrl))).status).toBe(404);

    const res = await fetch(`${callbackUrl}?code=the-code&state=${state}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("完了");

    const token = await done;
    expect(token).toMatchObject({ client_id: "cid", access_token: "acc", refresh_token: "ref" });
    expect(store.saved).toHaveLength(1);
    expect(Object.fromEntries(new URLSearchParams(tokenMock.calls[0]?.body ?? ""))).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: "http://127.0.0.1:0/callback",
    });
  });

  it("state が一致しなければ 400 を返して失敗する（CSRF 対策）", async () => {
    const tokenMock = createFetchMock(() => jsonResponse({ access_token: "acc", expires_in: 3600 }));
    const { urls, done } = start(tokenMock.fetch);
    const failed = done.catch((e: unknown) => e);
    const { callbackUrl } = await urls;
    expect((await fetch(`${callbackUrl}?code=c&state=wrong`)).status).toBe(400);
    expect(await failed).toBeInstanceOf(Error);
    expect(String(await failed)).toContain("state");
    expect(tokenMock.calls).toHaveLength(0);
  });

  it("認可画面で拒否された（error=access_denied）場合は失敗する", async () => {
    const tokenMock = createFetchMock(() => jsonResponse({}));
    const { urls, done } = start(tokenMock.fetch);
    const failed = done.catch((e: unknown) => e);
    const { authorizeUrl, callbackUrl } = await urls;
    await fetch(`${callbackUrl}?error=access_denied&state=${authorizeUrl.searchParams.get("state")}`);
    expect(String(await failed)).toContain("access_denied");
  });

  it("トークン交換に失敗したら失敗を表示して終わる", async () => {
    const tokenMock = createFetchMock(() => jsonResponse({ error: "invalid_grant" }, 400));
    const { urls, done, store } = start(tokenMock.fetch);
    const failed = done.catch((e: unknown) => e);
    const { authorizeUrl, callbackUrl } = await urls;
    const res = await fetch(`${callbackUrl}?code=c&state=${authorizeUrl.searchParams.get("state")}`);
    expect(res.status).toBe(500);
    expect(String(await failed)).toContain("invalid_grant");
    expect(store.saved).toHaveLength(0);
  });

  it("クライアント ID / シークレットが無ければ設定エラー", async () => {
    await expect(
      runAuthCommand(loadConfig({ MF_TOKEN_FILE: "none" }), { store: memoryStore(), openBrowser: () => {} }),
    ).rejects.toBeInstanceOf(ConfigError);
  });
});
