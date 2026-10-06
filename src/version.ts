/** サーバー名とバージョン（バージョンは package.json を正とする） */
import { createRequire } from "node:module";

const pkg = createRequire(import.meta.url)("../package.json") as { name: string; version: string };

export const SERVER_NAME = "mf-invoice-mcp-server";
export const PACKAGE_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
/** 利用者に案内する auth コマンド */
export const AUTH_COMMAND = `npx ${PACKAGE_NAME} auth`;
