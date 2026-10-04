#!/usr/bin/env node
// Decides how many independent attempts /implement should make. Prints a single
// integer. 1 means "just implement normally" — which is the answer unless the run
// has visibly stalled, because N attempts cost N times as much.
//
//   node scripts/bestofn/should-run.mjs           -> "1" or the configured N
//   node scripts/bestofn/should-run.mjs --explain -> a sentence explaining why
//
// Arming conditions (from .harness/state/attempts.json, written by the Stop hook and
// by /review):
//   testFailStreak  >= 2  two consecutive turns ended with the test suite failing
//   blockingRetries >= 2  blocking findings survived two rounds of fixes
//
// There is deliberately no setting that turns Best-of-N on permanently.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const THRESHOLD = 2;

const read = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);
const configPath =
  process.env.HARNESS_CONFIG ||
  [resolve(REPO, ".claude/harness.config.json"), resolve(REPO, ".claude/harness.config.example.json")].find(existsSync);
const config = configPath ? read(configPath, {}) : {};
const attempts = read(resolve(REPO, ".harness/state/attempts.json"), { testFailStreak: 0, blockingRetries: 0 });

const reasons = [];
if ((attempts.testFailStreak ?? 0) >= THRESHOLD) reasons.push(`テストが ${attempts.testFailStreak} 回連続で失敗`);
if ((attempts.blockingRetries ?? 0) >= THRESHOLD) reasons.push(`Blocking 指摘が ${attempts.blockingRetries} 回の修正後も残存`);

// Never ask for more attempts than the parallel budget allows.
const configured = Number.isInteger(config.budget?.bestOfN) ? config.budget.bestOfN : 1;
const cap = Number.isInteger(config.budget?.maxParallel) ? config.budget.maxParallel : configured;
const n = reasons.length ? Math.max(1, Math.min(configured, cap)) : 1;

if (process.argv.includes("--explain")) {
  console.log(
    n > 1
      ? `Best-of-N を発動します（N=${n}）。理由: ${reasons.join(" / ")}。独立した worktree で ${n} 回試し、テスト通過数で選びます。`
      : "Best-of-N は発動しません（N=1）。通常どおり 1 回で実装してください。",
  );
} else {
  console.log(String(n));
}
