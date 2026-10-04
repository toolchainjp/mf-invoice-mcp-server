#!/usr/bin/env node
// UserPromptSubmit: /plan, /implement and /review require a completed harness.config.json.
import { readStdinJson, loadConfig, missingRequired, block } from "./lib.mjs";
import { recordBlocked } from "./state.mjs";

const input = readStdinJson();
const prompt = String(input.prompt ?? "").trimStart();
if (!/^\/(plan|implement|review)(\s|$)/.test(prompt)) process.exit(0);

const { config, source, path } = loadConfig();
const missing = source === "config" ? missingRequired(config) : missingRequired(null);
if (missing.length) {
  const reason =
    `[harness] /plan, /implement, /review は .claude/harness.config.json の必須項目が埋まるまで実行できません。\n` +
    (source === "config" ? `ファイル: ${path}\n` : `ファイルがありません。.claude/harness.config.example.json をコピーして作成してください。\n`) +
    `未設定: ${missing.join(", ")}\n` +
    `設定後にもう一度実行してください。設定の意味は docs/agent-harness/POLICY.md を参照。`;
  recordBlocked("config.missing", reason);
  block(reason);
}
process.exit(0);
