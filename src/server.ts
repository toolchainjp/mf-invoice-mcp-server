/** MCP サーバーの組み立て（トランスポートには依存しない） */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createTokenProvider, type TokenStore } from "./auth.js";
import { MfInvoiceClient } from "./client.js";
import type { Config } from "./config.js";
import { operations as generatedOperations } from "./generated/operations.js";
import type { OperationDef } from "./openapi/convert.js";
import { ToolRegistry, executeTool } from "./tools.js";
import { SERVER_NAME, SERVER_VERSION } from "./version.js";

export interface CreateServerOptions {
  config: Config;
  /** テスト用に差し替え可能な fetch */
  fetch?: typeof fetch;
  operations?: readonly OperationDef[];
  /** 省略時は config.tokenFile のファイル */
  store?: TokenStore;
  /** 致命的でない問題の通知先（既定は標準エラー出力） */
  onWarning?: (message: string) => void;
}

const INSTRUCTIONS = [
  "マネーフォワード クラウド請求書 API v3 を操作するツール群です（自社情報・取引先・品目・請求書・見積書・送付履歴）。",
  "一覧系（get_partners, get_items, get_billings, get_quotes, get_sent_histories）は page / per_page（最大 100）でページ送りでき、応答の pagination に総件数が入ります。",
  "ID は一覧系のツールで取得してください。",
  "post_* / put_* / delete_* は実データを変更します。実行前に利用者へ内容を確認してください。",
  "郵送依頼（*_posting）は料金が発生する場合があります。",
].join("\n");

export function createServer(options: CreateServerOptions): Server {
  const { config } = options;
  const onWarning = options.onWarning ?? ((message: string) => console.error(`[${SERVER_NAME}] ${message}`));
  const registry = new ToolRegistry(options.operations ?? generatedOperations, {
    readOnly: config.readOnly,
    exclude: config.excludeTools,
  });
  const client = new MfInvoiceClient({
    baseUrl: config.apiBaseUrl,
    tokenProvider: createTokenProvider(config, {
      onWarning,
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.store ? { store: options.store } : {}),
    }),
    timeoutMs: config.timeoutMs,
    userAgent: `${SERVER_NAME}/${SERVER_VERSION}`,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  // OpenAPI から生成した JSON Schema をそのまま公開するため、低レベル API の Server を使う
  // （McpServer.registerTool は Zod スキーマ前提のため）
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: registry.list() }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    executeTool({ registry, client }, request.params.name, request.params.arguments),
  );

  return server;
}
