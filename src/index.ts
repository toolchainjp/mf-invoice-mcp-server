#!/usr/bin/env node
/**
 * エントリポイント。
 *   mf-invoice-mcp-server          stdio で MCP サーバーを起動する
 *   mf-invoice-mcp-server auth     OAuth 認可を行い、リフレッシュトークンを保存する
 * 標準出力は MCP のプロトコル通信に使うため、サーバー起動時のログは必ず標準エラー出力に書く。
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, loadConfig } from "./config.js";
import { runAuthCommand } from "./oauth-cli.js";
import { createServer } from "./server.js";
import { FileTokenStore } from "./token-store.js";
import { PACKAGE_NAME, SERVER_NAME, SERVER_VERSION } from "./version.js";

const HELP = `${SERVER_NAME} v${SERVER_VERSION}
マネーフォワード クラウド請求書 API v3 を MCP ツールとして公開する MCP サーバー（stdio）

使い方:
  npx ${PACKAGE_NAME}                 MCP サーバーを起動する（MCP クライアントから起動する）
  npx ${PACKAGE_NAME} auth            ブラウザで認可し、リフレッシュトークンをトークンファイルに保存する
      --no-browser                    ブラウザを自動で開かない（表示された URL を手で開く）
      --print                         取得したリフレッシュトークンを標準出力にも表示する
  npx ${PACKAGE_NAME} --version       バージョンを表示する

主な環境変数:
  MF_CLIENT_ID / MF_CLIENT_SECRET     アプリポータルで作成したアプリのクライアント ID / シークレット
  MF_REFRESH_TOKEN                    リフレッシュトークン（auth で保存した場合は不要）
  MF_ACCESS_TOKEN                     取得済みのアクセストークン（リフレッシュしない簡易方式）
  MF_TOKEN_FILE                       トークンの保存先（既定 ~/.config/mf-invoice-mcp-server/token.json、none で保存しない）
  MF_READ_ONLY=true                   参照系のツールだけを公開する
  MF_EXCLUDE_TOOLS                    公開しないツール名（カンマ区切り）

詳しくは https://github.com/toolchainjp/mf-invoice-mcp-server#readme を参照してください。
`;

async function runServer(): Promise<void> {
  const config = loadConfig();
  const server = createServer({ config });
  await server.connect(new StdioServerTransport());

  const auth =
    config.clientId && config.clientSecret
      ? "リフレッシュトークン"
      : config.accessToken
        ? "アクセストークン"
        : "未設定";
  console.error(
    `[${SERVER_NAME}] v${SERVER_VERSION} 起動（認証: ${auth}、読み取り専用: ${config.readOnly ? "はい" : "いいえ"}` +
      `${config.excludeTools.length ? `、無効化: ${config.excludeTools.join(", ")}` : ""}）`,
  );

  const shutdown = () => {
    void server.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function runAuth(args: string[]): Promise<void> {
  const unknown = args.filter((a) => a !== "--no-browser" && a !== "--print");
  if (unknown.length) throw new ConfigError(`auth の不明なオプション: ${unknown.join(" ")}`);

  const config = loadConfig();
  const store = config.tokenFile ? new FileTokenStore(config.tokenFile) : undefined;
  const token = await runAuthCommand(config, {
    store,
    ...(args.includes("--no-browser") ? { openBrowser: () => {} } : {}),
  });

  console.error(
    store
      ? `認可が完了しました。トークンを ${config.tokenFile} に保存しました。MCP サーバーは MF_CLIENT_ID / MF_CLIENT_SECRET だけで起動できます。`
      : "認可が完了しました（MF_TOKEN_FILE=none のため保存していません）。",
  );
  // 保存しない場合は、MF_REFRESH_TOKEN に設定できるよう表示する
  if (args.includes("--print") || !store) {
    console.error("次の値を環境変数 MF_REFRESH_TOKEN に設定してください:");
    console.log(token.refresh_token);
  }
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
      return runServer();
    case "auth":
      await runAuth(rest);
      process.exit(0);
      return;
    case "--version":
    case "-v":
      console.log(SERVER_VERSION);
      return;
    case "--help":
    case "-h":
    case "help":
      console.log(HELP);
      return;
    default:
      console.error(`不明なコマンドです: ${command}\n\n${HELP}`);
      process.exit(1);
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  const message =
    err instanceof ConfigError
      ? `設定エラー: ${err.message}`
      : err instanceof Error && err.name === "AuthError"
        ? err.message
        : String((err as Error)?.stack ?? err);
  console.error(`[${SERVER_NAME}] ${message}`);
  process.exit(1);
});
