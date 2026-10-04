#!/usr/bin/env node
// Picks the winning attempt among N worktrees. No model is involved.
//
//   node scripts/bestofn/select.mjs <worktree>... [--json]
//
// Ranking, in order:
//   1. more passing tests           (a run that fails to start counts as 0)
//   2. smaller diff                 (fewer changed lines against the base commit)
//   3. lexicographic path           (so the result never depends on scheduling)
//
// Pass counts are read from the test output using the well-known formats below. When
// none matches, a zero-exit run counts as 1 and a non-zero run as 0, so the ranking
// degrades to "passed / did not pass" rather than guessing.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const PASS_PATTERNS = [
  /(\d+)\s+passed/i, // pytest, jest summary line
  /^#\s*pass\s+(\d+)/im, // node --test TAP summary
  /Tests:\s+(\d+)\s+passed/i, // jest
  /(\d+)\s+passing/i, // mocha
  /ok\s+(\d+)\s+-\s+/i, // bare TAP: falls back to the highest ok index
];

/** Extracts a pass count from arbitrary test output. Exported for the tests. */
export function countPasses(output, exitCode) {
  const text = String(output ?? "");
  for (const re of PASS_PATTERNS) {
    const m = text.match(re);
    if (m) return Number(m[1]);
  }
  return exitCode === 0 ? 1 : 0;
}

/** Deterministic ordering of attempt results. Exported for the tests. */
export function rank(results) {
  return [...results].sort(
    (a, b) => b.passes - a.passes || a.diffLines - b.diffLines || a.path.localeCompare(b.path),
  );
}

function diffLines(worktree, base) {
  const r = spawnSync("git", ["diff", "--numstat", base], { cwd: worktree, encoding: "utf8" });
  if (r.status !== 0) return Number.MAX_SAFE_INTEGER;
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .reduce((sum, l) => {
      const [add, del] = l.split("\t");
      return sum + (Number(add) || 0) + (Number(del) || 0);
    }, 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const worktrees = args.filter((a) => !a.startsWith("--"));
  if (!worktrees.length) {
    console.error("usage: select.mjs <worktree>... [--json]");
    process.exit(2);
  }
  const configPath =
    process.env.HARNESS_CONFIG ||
    [resolve(REPO, ".claude/harness.config.json"), resolve(REPO, ".claude/harness.config.example.json")].find(existsSync);
  const config = configPath ? JSON.parse(readFileSync(configPath, "utf8")) : {};
  const testCmd = config.commands?.test;
  if (!testCmd) {
    console.error("commands.test is not set; cannot rank attempts");
    process.exit(1);
  }
  const base = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).stdout.trim();

  const results = worktrees.map((path) => {
    const r = spawnSync("bash", ["-lc", testCmd], { cwd: path, encoding: "utf8", env: { ...process.env, HARNESS_BESTOFN_ACTIVE: "1" } });
    const output = (r.stdout || "") + (r.stderr || "");
    return {
      path,
      exitCode: r.status ?? 1,
      passes: countPasses(output, r.status ?? 1),
      diffLines: diffLines(path, base),
      summary: (output.trim().split("\n").pop() || "").slice(0, 200),
    };
  });

  const ranked = rank(results);
  const winner = ranked[0];
  if (asJson) {
    console.log(JSON.stringify({ winner: winner.path, ranked }, null, 2));
  } else {
    console.log(`winner: ${winner.path} (passes=${winner.passes}, diffLines=${winner.diffLines})`);
    for (const r of ranked.slice(1)) console.log(`  rejected ${r.path}: passes=${r.passes}, diffLines=${r.diffLines} — ${r.summary}`);
  }
}
