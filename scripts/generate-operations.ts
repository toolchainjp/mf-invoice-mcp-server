/**
 * document.yaml から次の 2 ファイルを生成する。
 *   - src/generated/operations.ts（MCP ツールの元になる操作定義）
 *   - docs/tools.md（ツール一覧ドキュメント）
 *
 *   npm run generate
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "yaml";
import {
  extractOperations,
  renderOperationsModule,
  type OpenApiDocument,
  type OperationDef,
  type OperationKind,
} from "../src/openapi/convert.js";
import { buildInputSchema, mayIncurCharges } from "../src/tools.js";

const specPath = new URL("../document.yaml", import.meta.url);
const outPath = new URL("../src/generated/operations.ts", import.meta.url);
const docPath = new URL("../docs/tools.md", import.meta.url);

const KIND: Record<OperationKind, string> = { read: "参照", create: "登録", update: "更新", delete: "削除" };

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function renderToolsDoc(spec: OpenApiDocument, operations: OperationDef[]): string {
  const info = (spec as { info?: { title?: string; version?: string } }).info;
  const reads = operations.filter((o) => o.kind === "read").length;
  const lines = [
    "# ツール一覧",
    "",
    "> このファイルは `npm run generate` が `document.yaml` から生成しています。直接編集しないでください。",
    "",
    `仕様書: ${info?.title ?? "Money Forward Invoice API"} v${info?.version ?? "?"}。` +
      `全 ${operations.length} ツール（参照系 ${reads}、書き込み系 ${operations.length - reads}）。` +
      "`MF_READ_ONLY=true` のときは参照系だけが、`MF_EXCLUDE_TOOLS` に書いたツールは除いて公開されます。",
    "",
    "| ツール名 | 種別 | 概要 | HTTP | 必須引数 |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const op of operations) {
    const required = buildInputSchema(op).required ?? [];
    const summary =
      (op.description ?? op.summary) + (mayIncurCharges(op) ? "（料金が発生する場合あり）" : "");
    lines.push(
      `| \`${op.toolName}\` | ${KIND[op.kind]} | ${escapeCell(summary)} | \`${op.method} ${op.path}\` | ${
        required.length ? required.map((r) => `\`${r}\``).join(", ") : "—"
      } |`,
    );
  }

  lines.push("", "## 各ツールの詳細", "");
  for (const op of operations) {
    const schema = buildInputSchema(op);
    lines.push(`### \`${op.toolName}\``, "", op.mcp.description ?? op.summary, "");
    if (op.mcp.useWhen) lines.push(`- 使う場面: ${op.mcp.useWhen}`);
    if (op.mcp.doNotUseWhen) lines.push(`- 使わない場面: ${op.mcp.doNotUseWhen}`);
    lines.push(`- HTTP: \`${op.method} ${op.path}\`（operationId: \`${op.operationId}\`）`);
    if (op.scopes.length) lines.push(`- スコープ: ${op.scopes.map((s) => `\`${s}\``).join(", ")}`);
    if (mayIncurCharges(op)) lines.push("- 注意: 郵送料などの料金が発生する場合があります（HTTP 402）");

    const entries = Object.entries(schema.properties);
    if (!entries.length) {
      lines.push("", "引数なし。", "");
      continue;
    }
    lines.push("", "| 引数 | 型 | 必須 | 説明 |", "| --- | --- | --- | --- |");
    for (const [name, prop] of entries) {
      const type = Array.isArray(prop.type) ? prop.type.join(" \\| ") : String(prop.type ?? "object");
      const enumText = Array.isArray(prop.enum)
        ? `（${prop.enum.map((v) => JSON.stringify(v)).join(", ")}）`
        : "";
      const description =
        name === "body" ? "リクエストボディ（JSON）。項目は仕様書を参照" : String(prop.description ?? "");
      lines.push(
        `| \`${name}\` | ${type}${prop.format ? ` (${String(prop.format)})` : ""} | ${
          schema.required?.includes(name) ? "○" : ""
        } | ${escapeCell(description)}${escapeCell(enumText)} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

const spec = parse(readFileSync(specPath, "utf8")) as OpenApiDocument;
const operations = extractOperations(spec);
mkdirSync(new URL(".", outPath), { recursive: true });
writeFileSync(outPath, renderOperationsModule(operations), "utf8");
writeFileSync(docPath, renderToolsDoc(spec, operations), "utf8");

console.log(`${operations.length} 操作を src/generated/operations.ts と docs/tools.md に書き出しました`);
