import { describe, expect, it, vi } from "vitest";
import {
  AuthError,
  MissingCredentialsProvider,
  RefreshTokenProvider,
  StaticTokenProvider,
  createTokenProvider,
  requestToken,
  type TokenStore,
} from "../../src/auth.js";
import { loadConfig } from "../../src/config.js";
import type { StoredToken } from "../../src/token-store.js";
import { createFetchMock, jsonResponse, type RecordedCall } from "../helpers/fetch-mock.js";

const TOKEN_URL = "https://auth.example.test/token";
const BASIC = `Basic ${Buffer.from("cid:secret").toString("base64")}`;

function memoryStore(initial?: StoredToken): TokenStore & { saved: StoredToken[] } {
  let current = initial;
  const saved: StoredToken[] = [];
  return {
    saved,
    load: () => current,
    save: (t) => {
      saved.push(t);
      current = t;
    },
  };
}

function form(call: RecordedCall | undefined): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(call?.body ?? ""));
}

function tokenBody(n: number, extra: object = {}) {
  return { access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 3600, ...extra };
}

function provider(
  overrides: Partial<ConstructorParameters<typeof RefreshTokenProvider>[0]> = {},
): RefreshTokenProvider {
  return new RefreshTokenProvider({
    clientId: "cid",
    clientSecret: "secret",
    refreshToken: "env-refresh",
    tokenUrl: TOKEN_URL,
    authMethod: "client_secret_basic",
    ...overrides,
  });
}

describe("requestToken", () => {
  it("client_secret_basic: Basic 認証ヘッダーとフォームで POST する", async () => {
    const mock = createFetchMock(() => jsonResponse(tokenBody(1)));
    const res = await requestToken({
      tokenUrl: TOKEN_URL,
      clientId: "cid",
      clientSecret: "secret",
      authMethod: "client_secret_basic",
      params: { grant_type: "refresh_token", refresh_token: "r" },
      fetch: mock.fetch,
    });
    expect(res).toEqual(tokenBody(1));
    expect(mock.calls[0]).toMatchObject({
      url: TOKEN_URL,
      method: "POST",
      headers: { authorization: BASIC, "content-type": "application/x-www-form-urlencoded" },
    });
    expect(form(mock.calls[0])).toEqual({ grant_type: "refresh_token", refresh_token: "r" });
  });

  it("client_secret_post: client_id / client_secret をフォームに入れ、Authorization を付けない", async () => {
    const mock = createFetchMock(() => jsonResponse(tokenBody(1)));
    await requestToken({
      tokenUrl: TOKEN_URL,
      clientId: "cid",
      clientSecret: "secret",
      authMethod: "client_secret_post",
      params: { grant_type: "refresh_token", refresh_token: "r" },
      fetch: mock.fetch,
    });
    expect(mock.calls[0]?.headers.authorization).toBeUndefined();
    expect(form(mock.calls[0])).toEqual({
      grant_type: "refresh_token",
      refresh_token: "r",
      client_id: "cid",
      client_secret: "secret",
    });
  });

  it("クライアント ID / シークレットに記号が含まれていてもフォームエンコードしてから Basic にする（RFC 6749 2.3.1）", async () => {
    const mock = createFetchMock(() => jsonResponse(tokenBody(1)));
    await requestToken({
      tokenUrl: TOKEN_URL,
      clientId: "c:id",
      clientSecret: "s e+c",
      authMethod: "client_secret_basic",
      params: { grant_type: "refresh_token", refresh_token: "r" },
      fetch: mock.fetch,
    });
    expect(mock.calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("c%3Aid:s+e%2Bc").toString("base64")}`,
    );
  });

  it("エラー応答は OAuth のエラーコードとステータスを持つ AuthError にする", async () => {
    const mock = createFetchMock(() =>
      jsonResponse({ error: "invalid_grant", error_description: "expired" }, 400),
    );
    const err = await requestToken({
      tokenUrl: TOKEN_URL,
      clientId: "cid",
      clientSecret: "secret",
      authMethod: "client_secret_basic",
      params: { grant_type: "refresh_token", refresh_token: "r" },
      fetch: mock.fetch,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err).toMatchObject({ status: 400, code: "invalid_grant" });
    expect((err as Error).message).toContain("expired");
  });

  it("access_token が無い応答はエラー", async () => {
    const mock = createFetchMock(() => jsonResponse({ token_type: "Bearer" }));
    await expect(
      requestToken({
        tokenUrl: TOKEN_URL,
        clientId: "cid",
        clientSecret: "secret",
        authMethod: "client_secret_basic",
        params: { grant_type: "refresh_token", refresh_token: "r" },
        fetch: mock.fetch,
      }),
    ).rejects.toThrow(/access_token/);
  });

  it("通信エラーは AuthError にする", async () => {
    const mock = createFetchMock(() => {
      throw new TypeError("fetch failed");
    });
    await expect(
      requestToken({
        tokenUrl: TOKEN_URL,
        clientId: "cid",
        clientSecret: "secret",
        authMethod: "client_secret_basic",
        params: { grant_type: "refresh_token", refresh_token: "r" },
        fetch: mock.fetch,
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

describe("RefreshTokenProvider", () => {
  it("リフレッシュトークンでアクセストークンを取得し、期限 5 分前まで再利用する", async () => {
    let now = 1_000_000;
    let n = 0;
    const mock = createFetchMock(() => jsonResponse(tokenBody(++n)));
    const p = provider({ fetch: mock.fetch, now: () => now });

    expect(await p.getToken()).toBe("access-1");
    expect(form(mock.calls[0])).toEqual({ grant_type: "refresh_token", refresh_token: "env-refresh" });

    now += 54 * 60 * 1000;
    expect(await p.getToken()).toBe("access-1");
    expect(mock.calls).toHaveLength(1);

    now += 2 * 60 * 1000; // 残り 4 分 → 更新
    expect(await p.getToken()).toBe("access-2");
    expect(mock.calls).toHaveLength(2);
  });

  it("ローテーションで返った新しいリフレッシュトークンを次回の更新に使い、ストアに保存する", async () => {
    let now = 0;
    let n = 0;
    const store = memoryStore();
    const mock = createFetchMock(() => jsonResponse(tokenBody(++n, { scope: "mfc/invoice/data.read" })));
    const p = provider({ fetch: mock.fetch, now: () => now, store });

    await p.getToken();
    p.invalidate();
    now = 10;
    await p.getToken();

    expect(form(mock.calls[1]).refresh_token).toBe("refresh-1");
    expect(store.saved).toHaveLength(2);
    expect(store.saved[1]).toMatchObject({
      client_id: "cid",
      access_token: "access-2",
      refresh_token: "refresh-2",
      expires_at: 10 + 3600 * 1000,
      scope: "mfc/invoice/data.read",
    });
  });

  it("応答に refresh_token が無ければ使ったリフレッシュトークンを保持する", async () => {
    const store = memoryStore();
    const mock = createFetchMock(() => jsonResponse({ access_token: "a", expires_in: 3600 }));
    await provider({ fetch: mock.fetch, store }).getToken();
    expect(store.saved[0]?.refresh_token).toBe("env-refresh");
  });

  it("同時に呼ばれてもトークン取得は 1 回だけ", async () => {
    const mock = createFetchMock(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return jsonResponse(tokenBody(1));
    });
    const p = provider({ fetch: mock.fetch });
    expect(await Promise.all([p.getToken(), p.getToken(), p.getToken()])).toEqual([
      "access-1",
      "access-1",
      "access-1",
    ]);
    expect(mock.calls).toHaveLength(1);
  });

  it("ストアのリフレッシュトークンを環境変数より優先する", async () => {
    const store = memoryStore({ client_id: "cid", refresh_token: "stored-refresh" });
    const mock = createFetchMock(() => jsonResponse(tokenBody(1)));
    await provider({ fetch: mock.fetch, store }).getToken();
    expect(form(mock.calls[0]).refresh_token).toBe("stored-refresh");
  });

  it("ストアのリフレッシュトークンが invalid_grant なら環境変数の値でやり直す", async () => {
    const store = memoryStore({ client_id: "cid", refresh_token: "stale" });
    const mock = createFetchMock((call) =>
      form(call).refresh_token === "stale"
        ? jsonResponse({ error: "invalid_grant" }, 400)
        : jsonResponse(tokenBody(1)),
    );
    expect(await provider({ fetch: mock.fetch, store }).getToken()).toBe("access-1");
    expect(mock.calls.map((c) => form(c).refresh_token)).toEqual(["stale", "env-refresh"]);
  });

  it("すべてのリフレッシュトークンが無効なら auth コマンドの再実行を案内する", async () => {
    const mock = createFetchMock(() => jsonResponse({ error: "invalid_grant" }, 400));
    await expect(provider({ fetch: mock.fetch }).getToken()).rejects.toThrow(/auth/);
  });

  it("invalid_client（クライアント認証の失敗）は別のリフレッシュトークンを試さずにエラーにする", async () => {
    const store = memoryStore({ client_id: "cid", refresh_token: "stored" });
    const mock = createFetchMock(() => jsonResponse({ error: "invalid_client" }, 401));
    const err = await provider({ fetch: mock.fetch, store })
      .getToken()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as Error).message).toContain("MF_CLIENT_ID");
    expect(mock.calls).toHaveLength(1);
  });

  it("ストアに有効なアクセストークンがあれば取得せずに使う", async () => {
    const store = memoryStore({
      client_id: "cid",
      refresh_token: "r",
      access_token: "stored-access",
      expires_at: 10_000_000,
    });
    const mock = createFetchMock(() => jsonResponse(tokenBody(1)));
    expect(await provider({ fetch: mock.fetch, store, now: () => 0 }).getToken()).toBe("stored-access");
    expect(mock.calls).toHaveLength(0);
  });

  it("別のクライアント ID で保存されたトークンは使わない", async () => {
    const store = memoryStore({
      client_id: "other",
      refresh_token: "other-refresh",
      access_token: "other-access",
      expires_at: 10_000_000,
    });
    const mock = createFetchMock(() => jsonResponse(tokenBody(1)));
    expect(await provider({ fetch: mock.fetch, store, now: () => 0 }).getToken()).toBe("access-1");
    expect(form(mock.calls[0]).refresh_token).toBe("env-refresh");
  });

  it("ストアへの保存に失敗しても警告を出してトークンは返す", async () => {
    const onWarning = vi.fn();
    const store: TokenStore = {
      load: () => undefined,
      save: () => {
        throw new Error("EACCES");
      },
    };
    const mock = createFetchMock(() => jsonResponse(tokenBody(1)));
    expect(await provider({ fetch: mock.fetch, store, onWarning }).getToken()).toBe("access-1");
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("EACCES"));
  });

  it("リフレッシュトークンがどこにも無ければ設定エラー", async () => {
    const mock = createFetchMock(() => jsonResponse(tokenBody(1)));
    await expect(provider({ fetch: mock.fetch, refreshToken: undefined }).getToken()).rejects.toThrow(/auth/);
    expect(mock.calls).toHaveLength(0);
  });
});

describe("StaticTokenProvider / MissingCredentialsProvider", () => {
  it("固定トークンをそのまま返し、更新はできない", async () => {
    const p = new StaticTokenProvider("tok");
    expect(await p.getToken()).toBe("tok");
    expect(p.canRefresh).toBe(false);
  });

  it("認証情報が無いときは設定方法を案内する", async () => {
    await expect(new MissingCredentialsProvider().getToken()).rejects.toThrow(/MF_CLIENT_ID/);
    await expect(new MissingCredentialsProvider().getToken()).rejects.toThrow(/auth/);
  });
});

describe("createTokenProvider", () => {
  const base = { MF_TOKEN_FILE: "none" };

  it("クライアント ID・シークレット・リフレッシュトークンがあればリフレッシュ方式", () => {
    const config = loadConfig({ ...base, MF_CLIENT_ID: "c", MF_CLIENT_SECRET: "s", MF_REFRESH_TOKEN: "r" });
    expect(createTokenProvider(config)).toBeInstanceOf(RefreshTokenProvider);
  });

  it("リフレッシュトークンがストアにだけある場合もリフレッシュ方式", () => {
    const config = loadConfig({ ...base, MF_CLIENT_ID: "c", MF_CLIENT_SECRET: "s" });
    const store = memoryStore({ refresh_token: "r" });
    expect(createTokenProvider(config, { store })).toBeInstanceOf(RefreshTokenProvider);
  });

  it("リフレッシュ方式の条件がそろわずアクセストークンがあれば固定トークン", () => {
    const config = loadConfig({ ...base, MF_ACCESS_TOKEN: "t", MF_CLIENT_ID: "c" });
    expect(createTokenProvider(config)).toBeInstanceOf(StaticTokenProvider);
  });

  it("どちらも無ければ MissingCredentialsProvider", () => {
    expect(createTokenProvider(loadConfig(base))).toBeInstanceOf(MissingCredentialsProvider);
  });
});
