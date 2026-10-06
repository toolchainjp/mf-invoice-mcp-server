import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface ReceivedRequest {
  method: string;
  path: string;
  query: Array<[string, string]>;
  authorization: string | undefined;
  contentType: string | undefined;
  /** JSON は解釈した値、フォームは Record<string, string>、空なら undefined */
  body: unknown;
}

export const MOCK_CLIENT_ID = "test-client-id";
export const MOCK_CLIENT_SECRET = "test-client-secret";
export const MOCK_REFRESH_TOKEN = "test-refresh-token";
export const MOCK_AUTH_CODE = "test-auth-code";
/** 認可済みとして受け付ける固定のアクセストークン（MF_ACCESS_TOKEN 用） */
export const MOCK_STATIC_ACCESS_TOKEN = "test-static-access-token";

export const BASIC_AUTH = `Basic ${Buffer.from(`${MOCK_CLIENT_ID}:${MOCK_CLIENT_SECRET}`).toString("base64")}`;

/**
 * E2E テスト用の模擬 API。
 * - POST /token: refresh_token / authorization_code グラント（client_secret_basic / client_secret_post）。
 *   発行のたびにアクセストークンとリフレッシュトークンを新しくする（ローテーション）
 * - /api/v3/*: Bearer を検証し、決め打ちのレスポンスを返す
 */
export async function startMockMfApi() {
  const requests: ReceivedRequest[] = [];
  const validRefreshTokens = new Set([MOCK_REFRESH_TOKEN]);
  const validAccessTokens = new Set([MOCK_STATIC_ACCESS_TOKEN]);
  let issued = 0;

  const send = (
    res: ServerResponse,
    status: number,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    if (body === undefined) {
      res.writeHead(status, headers).end();
      return;
    }
    res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
  };

  const readBody = async (req: IncomingMessage): Promise<unknown> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text) return undefined;
    if (req.headers["content-type"]?.startsWith("application/x-www-form-urlencoded")) {
      return Object.fromEntries(new URLSearchParams(text));
    }
    return JSON.parse(text);
  };

  const issueTokens = () => {
    issued += 1;
    const accessToken = `access-${issued}`;
    const refreshToken = `refresh-${issued}`;
    validAccessTokens.add(accessToken);
    validRefreshTokens.add(refreshToken);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: "mfc/invoice/data.read mfc/invoice/data.write",
    };
  };

  const handleToken = (record: ReceivedRequest, res: ServerResponse) => {
    const form = (record.body ?? {}) as Record<string, string>;
    const basicOk = record.authorization === BASIC_AUTH;
    const postOk = form.client_id === MOCK_CLIENT_ID && form.client_secret === MOCK_CLIENT_SECRET;
    if (!basicOk && !postOk) return send(res, 401, { error: "invalid_client" });
    if (form.grant_type === "refresh_token") {
      if (!form.refresh_token || !validRefreshTokens.has(form.refresh_token)) {
        return send(res, 400, { error: "invalid_grant", error_description: "refresh token is invalid" });
      }
      return send(res, 200, issueTokens());
    }
    if (form.grant_type === "authorization_code") {
      if (form.code !== MOCK_AUTH_CODE) return send(res, 400, { error: "invalid_grant" });
      return send(res, 200, issueTokens());
    }
    return send(res, 400, { error: "unsupported_grant_type" });
  };

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const record: ReceivedRequest = {
        method: req.method ?? "GET",
        path: url.pathname,
        query: [...url.searchParams.entries()],
        authorization: req.headers.authorization,
        contentType: req.headers["content-type"],
        body: await readBody(req),
      };
      requests.push(record);

      if (record.method === "POST" && url.pathname === "/token") return handleToken(record, res);

      const bearer = record.authorization?.replace(/^Bearer /, "");
      if (!bearer || !validAccessTokens.has(bearer)) {
        return send(res, 401, { error: "invalid_token", error_description: "The access token is invalid" });
      }

      const key = `${record.method} ${url.pathname}`;
      switch (true) {
        case key === "GET /api/v3/office":
          return send(res, 200, { id: "OFFICE1", name: "テスト株式会社", office_code: "1234-5678" });
        case key === "GET /api/v3/partners":
          return send(res, 200, {
            data: [{ id: "P1", name: "取引先A" }],
            pagination: { total_count: 1, total_pages: 1, per_page: 100, current_page: 1 },
          });
        case key === "POST /api/v3/partners":
          return send(res, 201, { id: "P-NEW", ...(record.body as object) });
        case key === "GET /api/v3/billings/B%2F1":
        case key === "GET /api/v3/billings/B1":
          return send(res, 200, { id: decodeURIComponent(url.pathname.split("/").pop() ?? "") });
        case record.method === "DELETE" && url.pathname.startsWith("/api/v3/partners/"):
          return send(res, 204);
        case key === "POST /api/v3/billings/B1/posting":
          return send(res, 402, { errors: [{ message: "郵送料金の支払い方法が登録されていません" }] });
        case key === "GET /api/v3/items":
          return send(res, 429, { errors: [{ message: "Rate limit exceeded" }] }, { "retry-after": "30" });
        default:
          return send(res, 404, { errors: [{ message: `${key} not mocked` }] });
      }
    })().catch((err: unknown) => send(res, 500, { errors: [{ message: String(err) }] }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    apiBaseUrl: `${origin}/api/v3`,
    tokenUrl: `${origin}/token`,
    requests,
    apiRequests: () => requests.filter((r) => r.path.startsWith("/api/v3/")),
    tokenRequests: () => requests.filter((r) => r.path === "/token"),
    reset: () => {
      requests.length = 0;
    },
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}
