import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ConfigError,
  DEFAULT_API_BASE_URL,
  DEFAULT_AUTHORIZE_URL,
  DEFAULT_REDIRECT_URI,
  DEFAULT_SCOPES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TOKEN_URL,
  loadConfig,
} from "../../src/config.js";

const HOME = "/home/tester";

describe("loadConfig", () => {
  it("既定値", () => {
    expect(loadConfig({}, { homedir: HOME })).toEqual({
      accessToken: undefined,
      clientId: undefined,
      clientSecret: undefined,
      refreshToken: undefined,
      tokenFile: join(HOME, ".config", "mf-invoice-mcp-server", "token.json"),
      tokenAuthMethod: "client_secret_basic",
      apiBaseUrl: DEFAULT_API_BASE_URL,
      tokenUrl: DEFAULT_TOKEN_URL,
      authorizeUrl: DEFAULT_AUTHORIZE_URL,
      redirectUri: DEFAULT_REDIRECT_URI,
      authListenHost: undefined,
      scopes: DEFAULT_SCOPES,
      readOnly: false,
      excludeTools: [],
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    expect(DEFAULT_API_BASE_URL).toBe("https://invoice.moneyforward.com/api/v3");
    expect(DEFAULT_TOKEN_URL).toBe("https://api.biz.moneyforward.com/token");
    expect(DEFAULT_AUTHORIZE_URL).toBe("https://api.biz.moneyforward.com/authorize");
  });

  it("環境変数を読み、前後の空白を除く", () => {
    const config = loadConfig(
      {
        MF_ACCESS_TOKEN: " at ",
        MF_CLIENT_ID: "cid",
        MF_CLIENT_SECRET: "sec",
        MF_REFRESH_TOKEN: "rt",
        MF_TOKEN_FILE: "/tmp/t.json",
        MF_TOKEN_AUTH_METHOD: "client_secret_post",
        MF_API_BASE_URL: "http://127.0.0.1:9999/api/v3/",
        MF_TOKEN_URL: "http://127.0.0.1:9999/token",
        MF_AUTHORIZE_URL: "http://127.0.0.1:9999/authorize",
        MF_REDIRECT_URI: "http://localhost:3000/cb",
        MF_AUTH_LISTEN_HOST: "0.0.0.0",
        MF_SCOPES: "mfc/invoice/data.read",
        MF_READ_ONLY: "true",
        MF_EXCLUDE_TOOLS: " post_billings_billing_id_posting , post_quotes_quote_id_posting ,",
        MF_TIMEOUT_MS: "5000",
      },
      { homedir: HOME },
    );
    expect(config).toEqual({
      accessToken: "at",
      clientId: "cid",
      clientSecret: "sec",
      refreshToken: "rt",
      tokenFile: "/tmp/t.json",
      tokenAuthMethod: "client_secret_post",
      apiBaseUrl: "http://127.0.0.1:9999/api/v3",
      tokenUrl: "http://127.0.0.1:9999/token",
      authorizeUrl: "http://127.0.0.1:9999/authorize",
      redirectUri: "http://localhost:3000/cb",
      authListenHost: "0.0.0.0",
      scopes: "mfc/invoice/data.read",
      readOnly: true,
      excludeTools: ["post_billings_billing_id_posting", "post_quotes_quote_id_posting"],
      timeoutMs: 5000,
    });
  });

  it("MF_TOKEN_FILE=none でトークンファイルを使わない", () => {
    expect(loadConfig({ MF_TOKEN_FILE: "none" }, { homedir: HOME }).tokenFile).toBeUndefined();
  });

  it.each([
    ["1", true],
    ["yes", true],
    ["ON", true],
    ["0", false],
    ["false", false],
    ["off", false],
  ])("MF_READ_ONLY=%s → %s", (value, expected) => {
    expect(loadConfig({ MF_READ_ONLY: value }, { homedir: HOME }).readOnly).toBe(expected);
  });

  it.each([
    [{ MF_READ_ONLY: "maybe" }, /MF_READ_ONLY/],
    [{ MF_TIMEOUT_MS: "-1" }, /MF_TIMEOUT_MS/],
    [{ MF_TIMEOUT_MS: "1.5" }, /MF_TIMEOUT_MS/],
    [{ MF_API_BASE_URL: "not a url" }, /MF_API_BASE_URL/],
    [{ MF_TOKEN_URL: "ftp://example.com/token" }, /MF_TOKEN_URL/],
    [{ MF_TOKEN_AUTH_METHOD: "private_key_jwt" }, /MF_TOKEN_AUTH_METHOD/],
  ])("不正な値 %j は ConfigError", (env, message) => {
    expect(() => loadConfig(env, { homedir: HOME })).toThrow(ConfigError);
    expect(() => loadConfig(env, { homedir: HOME })).toThrow(message);
  });
});
