#!/usr/bin/env node
// PreToolUse: blocks Tier 3 operations and tells Claude to ask a human instead.
// Sources of truth: destructive-command patterns below (policy, not project facts),
// and harness.config.json for protectedPaths / secretPaths / deploy.productionPatterns
// / budget / agents (project facts).
import { readStdinJson, loadConfig, deny, matchesAny, normalizePath, pathLikeTokens } from "./lib.mjs";
import { readSubagents, writeSubagents, withLock, recordBlocked } from "./state.mjs";
import { checkAgentCall } from "./agents.mjs";

const input = readStdinJson();
const { config, source } = loadConfig();
const protectedPaths = config?.protectedPaths ?? []; // write-protected (readable)
const secretPaths = config?.secretPaths ?? []; // neither read nor write
const productionPatterns = (config?.deploy?.productionPatterns ?? []).filter(Boolean);
const tool = input.tool_name || "";
const ti = input.tool_input || {};

// Policy: irreversible or externally visible commands. Reversibility and side effects decide the tier.
const DESTRUCTIVE = [
  [/(^|[\s;&|])rm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+/, "再帰的/強制削除（rm -r / rm -f）"],
  [/(^|[\s;&|])rm\s+.*\s\/(\s|$)/, "ルート直下の削除"],
  [/git\s+push\b[^\n;&|]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+\S)/, "force push"],
  [/git\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f|branch\s+-D|checkout\s+--\s+\.)/, "作業ツリー/ブランチの破壊的操作"],
  [/git\s+push\b[^\n;&|]*\s--delete\b/, "リモートブランチの削除"],
  [/(^|[\s;&|])(curl|wget|http|https)\s/, "任意ホストへのネットワークアクセス（curl / wget）。必要なら WebFetch の許可ドメインを使う"],
  [/(^|[\s;&|])sudo\s/, "sudo"],
  [/(^|[\s;&|])(mkfs|dd\s+if=|shred|chmod\s+-R\s+777|chown\s+-R)\b/, "システム破壊につながるコマンド"],
  [/(^|[\s;&|])(wrangler\s+(deploy|publish)|vercel(\s+deploy)?\s+--prod|netlify\s+deploy\s+--prod|fly\s+deploy|gcloud\s+\S+\s+deploy|aws\s+\S+\s+(deploy|update-function-code|put-object)|kubectl\s+(apply|delete|rollout)|helm\s+(install|upgrade|uninstall)|terraform\s+(apply|destroy)|pulumi\s+(up|destroy)|cdk\s+deploy|sam\s+deploy|serverless\s+deploy|firebase\s+deploy|eb\s+deploy)\b/, "デプロイコマンド。デプロイは PR マージ後の deploy ワークフローだけが行う"],
  [/(^|[\s;&|])(npm|pnpm|yarn)\s+publish\b/, "パッケージの公開"],
  [/(^|[\s;&|])gh\s+(repo\s+delete|secret\s+set|release\s+create)\b/, "GitHub 上の公開/削除/シークレット操作"],
  [/(^|[\s;&|])(printenv|env)\s*($|[|;&])/, "環境変数一覧の出力（シークレットが含まれる可能性）"],
  [/(^|[\s;&|])(export|echo)\s+\$?\{?[A-Z_]*(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE)[A-Z_]*\}?/, "シークレットらしき環境変数の出力"],
];

function refuse(kind, reason) {
  recordBlocked(kind, reason);
  deny(reason);
}

function checkBash(command) {
  for (const [re, label] of DESTRUCTIVE) {
    if (re.test(command)) refuse("tier3.command", `ブロック: ${label}\nコマンド: ${command}`);
  }
  for (const pat of productionPatterns) {
    let re;
    try { re = new RegExp(pat, "i"); } catch { continue; }
    if (re.test(command)) refuse("tier3.production", `ブロック: 本番環境を示すパターン /${pat}/ に一致しました（harness.config.json の deploy.productionPatterns）。\nコマンド: ${command}`);
  }
  // Any mention of a secret path in a shell command (cat .env, sed -i, > .env, ...)
  for (const tok of pathLikeTokens(command)) {
    const hit = matchesAny(normalizePath(tok), secretPaths);
    if (hit) refuse("tier3.secretPath", `ブロック: シークレットを含みうるパス "${tok}"（パターン: ${hit}）。\nコマンド: ${command}`);
  }
  // Writes to protected paths through the shell: redirects, tee, in-place edits, copies/moves onto them
  const writeTargets = [
    ...[...command.matchAll(/(?:>>?|\btee\s+(?:-a\s+)?)\s*["']?([^\s"'|;&]+)/g)].map((m) => m[1]),
    ...(/\b(sed\s+-i|perl\s+-p?i|mv|cp|rm|touch|install|ln)\b/.test(command) ? pathLikeTokens(command) : []),
  ];
  for (const tok of writeTargets) {
    const hit = matchesAny(normalizePath(tok), protectedPaths);
    if (hit) refuse("tier3.protectedPath", `ブロック: 保護パス "${tok}"（パターン: ${hit}）への書き込み。このパスの変更は人が PR で行います。\nコマンド: ${command}`);
  }
}

function checkFile(filePath, { write }) {
  if (!filePath) return;
  const rel = normalizePath(filePath);
  const secret = matchesAny(rel, secretPaths);
  if (secret) refuse("tier3.secretPath", `ブロック: シークレットを含みうるパス "${filePath}"（パターン: ${secret}）は読み書きできません。`);
  if (write) {
    const hit = matchesAny(rel, protectedPaths);
    if (hit) refuse("tier3.protectedPath", `ブロック: 保護パス "${filePath}" の編集（パターン: ${hit}）。このパスの変更は人が PR で行います。`);
  }
}

// Agent: enforce the parallel/nesting budget and the model tier from harness.config.json.
// This is the only hook event that can deny a subagent (SubagentStart cannot block).
function checkAgent() {
  const agentName = String(ti.subagent_type ?? "");
  const verdict = withLock(() => {
    const state = readSubagents();
    const v = checkAgentCall({ state, config, agentName, model: ti.model, callerAgentId: input.agent_id });
    if (v.ok) {
      // Reserve the slot now: several Agent calls can arrive in one message, and the
      // matching SubagentStart may not have fired yet.
      state.slots = state.slots ?? [];
      state.slots.push({ agent: agentName, at: Date.now(), depth: v.depth, tool_use_id: input.tool_use_id ?? null });
      writeSubagents(state);
    }
    return v;
  });
  if (!verdict.ok) refuse(verdict.kind, `ブロック: ${verdict.reason}`);
}

if (tool === "Bash") checkBash(String(ti.command ?? ""));
else if (tool === "Read") checkFile(ti.file_path, { write: false });
else if (tool === "Edit" || tool === "Write") checkFile(ti.file_path, { write: true });
else if (tool === "NotebookEdit") checkFile(ti.notebook_path, { write: true });
else if (tool === "Agent") checkAgent();

if (source === "none") {
  // No config at all: protected-path defaults are unavailable. Still allow, but say so.
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "注意: .claude/harness.config.json も example も見つからないため、保護パスの検査は行われていません。" } }) + "\n");
}
process.exit(0);
