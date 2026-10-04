#!/usr/bin/env node
// Deterministic gate in front of /review: reviewers are expensive and their findings
// are noise while the machine checks are still red, so lint / typecheck / test must
// pass before any verifier is spawned.
//
//   node scripts/review/gate.mjs            -> prints a verdict, exit 0 (open) / 1 (closed)
//   node scripts/review/gate.mjs --json     -> machine-readable
//   node scripts/review/gate.mjs --advisory -> same text, always exit 0
//
// --advisory exists because a slash command embeds this with `!`...``, and a non-zero
// exit from an injected command aborts the whole command invocation before Claude sees
// any of its instructions. The verdict has to arrive as text, not as an exit code.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const asJson = process.argv.includes("--json");
const advisory = process.argv.includes("--advisory");
const finish = (open) => process.exit(open || advisory ? 0 : 1);

const configPath = process.env.HARNESS_CONFIG || resolve(REPO, ".claude/harness.config.json");
if (!existsSync(configPath)) {
  const msg = "CLOSED: .claude/harness.config.json がありません。example をコピーして設定してください。";
  console.log(asJson ? JSON.stringify({ open: false, reason: msg, steps: [] }) : msg);
  finish(false);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));

const steps = [];
let open = true;
for (const name of ["lint", "typecheck", "test"]) {
  const template = config.commands?.[name] ?? "";
  if (!template) {
    steps.push({ name, status: "skipped", detail: `commands.${name} が空` });
    continue;
  }
  // {file} has no meaning for a whole-tree gate; run against the project.
  const cmd = template.replaceAll("{file}", ".");
  const r = spawnSync("bash", ["-lc", cmd], { cwd: REPO, encoding: "utf8" });
  const ok = r.status === 0;
  if (!ok) open = false;
  steps.push({
    name,
    status: ok ? "passed" : "failed",
    cmd,
    detail: ok ? "" : (r.stdout + r.stderr).trim().slice(-2000),
  });
}

if (asJson) {
  console.log(JSON.stringify({ open, steps }, null, 2));
} else if (open) {
  console.log(`OPEN: ${steps.map((s) => `${s.name}=${s.status}`).join(" ")} — verifier を起動してよい`);
} else {
  console.log("CLOSED: 決定的チェックが失敗しています。verifier は起動しません。先にこれを直してください。\n");
  for (const s of steps.filter((x) => x.status === "failed")) {
    console.log(`### ${s.name} failed\n$ ${s.cmd}\n${s.detail}\n`);
  }
}
finish(open);
