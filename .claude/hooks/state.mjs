// Shared state for the agent-team hooks. Everything lives under .harness/ (gitignored)
// so a crashed session leaves nothing behind that a human has to clean up by hand.
//
// Files:
//   .harness/state/subagents.json  reserved parallel slots + agent_id -> depth
//   .harness/state/attempts.json   consecutive failures that arm Best-of-N
//   .harness/blocked.jsonl         one line per hook block, read by the workflows
//                                  after a Claude step and forwarded to Slack
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { projectDir } from "./lib.mjs";

const STALE_MS = 10 * 60 * 1000; // a slot older than this belongs to a session that died

export const harnessDir = (dir = projectDir()) => join(dir, ".harness");
const stateDir = (dir) => join(harnessDir(dir), "state");

function ensure(dir) {
  mkdirSync(stateDir(dir), { recursive: true });
}

/** Sleeps synchronously without spinning the CPU. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Runs `fn` while holding an exclusive lock, so two hook processes starting at the
 * same moment cannot both reserve the last parallel slot. mkdir is atomic on both
 * Linux and macOS. Falls through without the lock after ~1s rather than blocking a
 * tool call forever.
 */
export function withLock(fn, dir = projectDir()) {
  ensure(dir);
  const lock = join(stateDir(dir), ".lock");
  let held = false;
  for (let i = 0; i < 50; i++) {
    try { mkdirSync(lock); held = true; break; } catch { sleepSync(20); }
  }
  try {
    return fn();
  } finally {
    if (held) { try { rmdirSync(lock); } catch { /* already gone */ } }
  }
}

export function readState(name, fallback, dir = projectDir()) {
  const p = join(stateDir(dir), name);
  if (!existsSync(p)) return structuredClone(fallback);
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return structuredClone(fallback); }
}

export function writeState(name, value, dir = projectDir()) {
  ensure(dir);
  const p = join(stateDir(dir), name);
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, p); // atomic replace, so a reader never sees a half-written file
}

const EMPTY_SUBAGENTS = { slots: [], agents: {} };

/** Drops slots left behind by a session that exited without a SubagentStop. */
export function pruneSlots(state, now = Date.now()) {
  state.slots = (state.slots ?? []).filter((s) => now - (s.at ?? 0) < STALE_MS);
  for (const [id, a] of Object.entries(state.agents ?? {})) {
    if (now - (a.at ?? 0) >= STALE_MS) delete state.agents[id];
  }
  return state;
}

export function readSubagents(dir = projectDir()) {
  return pruneSlots(readState("subagents.json", EMPTY_SUBAGENTS, dir));
}
export const writeSubagents = (s, dir = projectDir()) => writeState("subagents.json", s, dir);

const EMPTY_ATTEMPTS = { testFailStreak: 0, blockingRetries: 0 };
export const readAttempts = (dir = projectDir()) => readState("attempts.json", EMPTY_ATTEMPTS, dir);
export const writeAttempts = (a, dir = projectDir()) => writeState("attempts.json", a, dir);

/**
 * Appends a machine-readable record of a hook block. The hook never talks to Slack
 * itself: the workflows read this file after the Claude step and call notify-slack.yml,
 * keeping every outbound message on the GitHub Actions path.
 */
export function recordBlocked(kind, reason, dir = projectDir()) {
  try {
    mkdirSync(harnessDir(dir), { recursive: true });
    appendFileSync(
      join(harnessDir(dir), "blocked.jsonl"),
      JSON.stringify({ ts: new Date().toISOString(), kind, reason: String(reason).slice(0, 400) }) + "\n",
    );
  } catch { /* never let bookkeeping break a tool call */ }
}
