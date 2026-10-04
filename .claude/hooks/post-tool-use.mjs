#!/usr/bin/env node
// PostToolUse (Edit|Write|NotebookEdit): run format -> lint -> typecheck on the edited file.
// PostToolUse cannot undo the edit; exit 2 makes the failure output visible to Claude.
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { readStdinJson, loadConfig, runCommand, context, block, normalizePath } from "./lib.mjs";

const input = readStdinJson();
const ti = input.tool_input || {};
const file = ti.file_path || ti.notebook_path;
const { config, source } = loadConfig();

if (!file || !existsSync(file)) process.exit(0);
// Files outside the project (scratch dirs, /tmp) are not this project's code: nothing to check.
if (isAbsolute(normalizePath(file))) process.exit(0);
// The example config's commands are placeholders; only a real project config is executed.
if (source !== "config") {
  context("[harness] .claude/harness.config.json が無いため format/lint/typecheck は実行されていません（example.json をコピーして設定してください）。", "PostToolUse");
  process.exit(0);
}

const notes = [];
const failures = [];
for (const step of ["format", "lint", "typecheck"]) {
  const template = config.commands?.[step] ?? "";
  if (!template) { notes.push(`${step}: 未設定（commands.${step} が空）のためスキップ`); continue; }
  const r = runCommand(template, { file });
  if (r.status !== 0) {
    const hint = r.status === 127 ? "（exit 127: コマンドが見つかりません。ツールが未インストールか、commands の設定を見直してください）" : "";
    failures.push(`### ${step} failed (exit ${r.status})${hint}\n$ ${r.cmd}\n${(r.stdout + r.stderr).trim().slice(0, 8000)}`);
    break; // format -> lint -> typecheck: stop at the first failure
  }
  notes.push(`${step}: ok`);
}

const rel = normalizePath(file);
if (failures.length) {
  block(`[harness] ${rel} の編集後チェックに失敗しました（config: ${source}）。修正してから続けてください。\n\n${failures.join("\n\n")}`);
}
if (notes.some((n) => n.includes("スキップ"))) context(`[harness] ${rel}: ${notes.join("; ")}`, "PostToolUse");
process.exit(0);
