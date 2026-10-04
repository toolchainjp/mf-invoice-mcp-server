#!/usr/bin/env node
// Runs N independent attempts at the same task and applies the winner.
//
//   node scripts/bestofn/run.mjs <plan-path> [--n N] [--dry-run]
//
// The orchestration is a script rather than something the model arranges, so the
// worktree paths, the attempt count and the tie-breaks are all known and testable.
// Each attempt gets its own git worktree, so attempts never see each other's edits.
//
// Recursion guard: an attempt is itself a Claude session, and that session must not
// start another Best-of-N round. HARNESS_BESTOFN_ACTIVE=1 is set for the children and
// this script refuses to run when it sees it.
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const REPO = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "../..");

if (process.env.HARNESS_BESTOFN_ACTIVE === "1") {
  console.error("[harness] Best-of-N の試行の中から Best-of-N は起動できません（再帰防止）。");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const planPath = args.find((a) => !a.startsWith("--"));
if (!planPath) {
  console.error("usage: run.mjs <plan-path> [--n N] [--dry-run]");
  process.exit(2);
}
if (!existsSync(resolve(REPO, planPath))) {
  console.error(`plan not found: ${planPath}`);
  process.exit(1);
}

const configPath = process.env.HARNESS_CONFIG || resolve(REPO, ".claude/harness.config.json");
if (!existsSync(configPath)) {
  console.error("[harness] .claude/harness.config.json がありません。");
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));

const nFlag = args.indexOf("--n");
const requested = nFlag >= 0 ? Number(args[nFlag + 1]) : Number(spawnSync("node", [join(REPO, "scripts/bestofn/should-run.mjs")], { encoding: "utf8" }).stdout.trim());
const N = Math.max(1, Math.min(requested || 1, config.budget?.maxParallel ?? 1, config.budget?.bestOfN ?? 1));
if (N < 2) {
  console.log("Best-of-N は発動条件を満たしていません（N=1）。通常どおり実装してください。");
  process.exit(0);
}

const model = config.agents?.implementer?.model;
const maxTurns = config.budget?.maxTurns ?? 30;
const root = join(REPO, ".harness/bestofn");
const git = (a, cwd = REPO) => spawnSync("git", a, { cwd, encoding: "utf8" });

// Fresh worktrees for this round.
rmSync(root, { recursive: true, force: true });
git(["worktree", "prune"]);
mkdirSync(root, { recursive: true });

const base = git(["rev-parse", "HEAD"]).stdout.trim();
const trees = [];
for (let i = 1; i <= N; i++) {
  const path = join(root, String(i));
  const branch = `harness/bestofn-${base.slice(0, 7)}-${i}`;
  git(["worktree", "add", "-f", "-B", branch, path, base]);
  trees.push({ path, branch });
}
console.log(`worktrees: ${trees.map((t) => t.path).join(" ")}`);

const prompt =
  `/implement ${planPath}\n` +
  `You are one of ${N} independent attempts at this task. Other attempts are running in parallel and you cannot see them. ` +
  `Implement the approved design memo and make the test suite pass. Do not create branches, commits or pull requests.`;

if (dryRun) {
  console.log("--dry-run: 試行は起動しません。次のコマンドが実行される予定でした:");
  for (const t of trees) console.log(`  (cd ${t.path} && claude -p ${JSON.stringify(prompt)} --agent implementer --model ${model} --max-turns ${maxTurns})`);
  process.exit(0);
}

const children = trees.map(
  (t) =>
    new Promise((done) => {
      const c = spawn("claude", ["-p", prompt, "--agent", "implementer", "--model", model, "--max-turns", String(maxTurns), "--permission-mode", "acceptEdits", "--no-session-persistence"], {
        cwd: t.path,
        env: { ...process.env, HARNESS_BESTOFN_ACTIVE: "1", CLAUDE_PROJECT_DIR: t.path },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      c.stdout.on("data", (d) => (out += d));
      c.stderr.on("data", (d) => (out += d));
      c.on("close", (code) => {
        console.log(`attempt ${t.path}: exit ${code}`);
        done({ ...t, code, tail: out.trim().split("\n").slice(-3).join(" | ").slice(0, 300) });
      });
    }),
);
const finished = await Promise.all(children);

const sel = spawnSync("node", [join(REPO, "scripts/bestofn/select.mjs"), ...trees.map((t) => t.path), "--json"], { cwd: REPO, encoding: "utf8" });
if (sel.status !== 0 && !sel.stdout) {
  console.error("selection failed:", sel.stderr);
  process.exit(1);
}
const { winner, ranked } = JSON.parse(sel.stdout);
console.log(`\nwinner: ${winner}`);

// Apply the winner onto the main working tree, then drop every attempt.
const patch = spawnSync("git", ["diff", base], { cwd: winner, encoding: "utf8" }).stdout;
if (patch.trim()) {
  const apply = spawnSync("git", ["apply", "--3way", "-"], { cwd: REPO, input: patch, encoding: "utf8" });
  if (apply.status !== 0) {
    console.error(`[harness] 勝者の差分を適用できませんでした。worktree を残します: ${winner}\n${apply.stderr}`);
    process.exit(1);
  }
  console.log("勝者の差分を主作業ツリーに適用しました。");
} else {
  console.log("勝者の差分は空でした（変更なし）。");
}

const losers = ranked.slice(1).map((r) => ({ ...r, tail: finished.find((f) => f.path === r.path)?.tail ?? "" }));
for (const t of trees) {
  git(["worktree", "remove", "--force", t.path]);
  git(["branch", "-D", t.branch]);
}
rmSync(root, { recursive: true, force: true });

console.log("\n## 採用しなかった試行（要約のみ。作業ツリーは削除済み）");
for (const l of losers) console.log(`- passes=${l.passes} diffLines=${l.diffLines} — ${l.summary || l.tail || "(出力なし)"}`);
