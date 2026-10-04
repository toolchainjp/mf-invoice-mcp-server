// Tests for the agent-team layer: parallel/nesting budget, model tier enforcement,
// explorer output limits, deterministic finding merge, and Best-of-N arming/selection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { checkAgentCall, checkExplorerOutput, modelForAgent, ROLE_OF } from "../../.claude/hooks/agents.mjs";
import { extractPayload, mergeFindings, toMarkdown } from "../../scripts/review/merge-findings.mjs";
import { countPasses, rank } from "../../scripts/bestofn/select.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const HOOKS = join(REPO, ".claude/hooks");
const EXAMPLE = JSON.parse(readFileSync(join(REPO, ".claude/harness.config.example.json"), "utf8"));

function fullConfig(overrides = {}) {
  const c = structuredClone(EXAMPLE);
  c.approvers = ["alice"];
  c.deploy.target = "example-host";
  c.deploy.productionBranch = "main";
  c.commands = { format: "true", lint: "true", typecheck: "", test: "true" };
  return deepMerge(c, overrides);
}
function deepMerge(a, b) {
  for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(a[k] ?? {}, v) : v;
  return a;
}
function makeProject({ config } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "harness-agents-"));
  mkdirSync(join(dir, ".claude"), { recursive: true });
  cpSync(join(REPO, ".claude/harness.config.example.json"), join(dir, ".claude/harness.config.example.json"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: dir });
  if (config) writeFileSync(join(dir, ".claude/harness.config.json"), JSON.stringify(config, null, 2));
  return dir;
}
function runHook(hook, payload, dir, env = {}) {
  const r = spawnSync("node", [join(HOOKS, hook)], {
    cwd: dir,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, HARNESS_CONFIG: "", ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const agentCall = (subagent_type, model, extra = {}) => ({
  tool_name: "Agent",
  tool_input: { subagent_type, model, prompt: "x" },
  tool_use_id: `toolu_${Math.random().toString(36).slice(2)}`,
  ...extra,
});

// ---------- model tier is decided by config, not by the agent files ----------
test("no harness subagent hardcodes a model in its frontmatter", () => {
  for (const name of Object.keys(ROLE_OF)) {
    const p = join(REPO, `.claude/agents/${name}.md`);
    if (!existsSync(p)) continue;
    const fm = readFileSync(p, "utf8").split("---")[1] ?? "";
    assert.ok(!/^model:/m.test(fm), `${name}.md must not pin a model; harness.config.json decides the tier`);
  }
});

test("modelForAgent maps every verifier to the verifier tier", () => {
  const c = fullConfig();
  assert.equal(modelForAgent(c, "verifier-spec"), c.agents.verifier.model);
  assert.equal(modelForAgent(c, "verifier-test"), c.agents.verifier.model);
  assert.equal(modelForAgent(c, "verifier-security"), c.agents.verifier.model);
  assert.equal(modelForAgent(c, "planner"), c.agents.planner.model);
  assert.equal(modelForAgent(c, "explorer"), c.agents.explorer.model);
  assert.equal(modelForAgent(c, "some-other-agent"), "", "non-harness agents are not constrained");
});

// ---------- checkAgentCall ----------
test("checkAgentCall enforces maxParallel", () => {
  const config = fullConfig({ budget: { maxParallel: 2 } });
  const model = config.agents.verifier.model;
  const state = { slots: [], agents: {} };
  for (let i = 0; i < 2; i++) {
    const v = checkAgentCall({ state, config, agentName: "verifier-spec", model });
    assert.equal(v.ok, true);
    state.slots.push({ agent: "verifier-spec", at: Date.now(), depth: v.depth });
  }
  const denied = checkAgentCall({ state, config, agentName: "verifier-spec", model });
  assert.equal(denied.ok, false);
  assert.equal(denied.kind, "budget.maxParallel");
  assert.match(denied.reason, /上限 2/);
});

test("checkAgentCall enforces maxDepth", () => {
  const config = fullConfig({ budget: { maxDepth: 1 } });
  const model = config.agents.explorer.model;
  const state = { slots: [], agents: { a1: { agent: "implementer", depth: 1, at: Date.now() } } };
  // from the main conversation: depth 1, allowed
  assert.equal(checkAgentCall({ state, config, agentName: "explorer", model }).ok, true);
  // from inside a subagent: depth 2, denied
  const denied = checkAgentCall({ state, config, agentName: "explorer", model, callerAgentId: "a1" });
  assert.equal(denied.ok, false);
  assert.equal(denied.kind, "budget.maxDepth");

  // maxDepth 2 permits one level of nesting but not two
  const deeper = fullConfig({ budget: { maxDepth: 2 } });
  assert.equal(checkAgentCall({ state, config: deeper, agentName: "explorer", model, callerAgentId: "a1" }).ok, true);
  const s2 = { slots: [], agents: { a2: { agent: "explorer", depth: 2, at: Date.now() } } };
  assert.equal(checkAgentCall({ state: s2, config: deeper, agentName: "explorer", model, callerAgentId: "a2" }).ok, false);
});

test("checkAgentCall rejects a model that does not match the config", () => {
  const config = fullConfig();
  const state = { slots: [], agents: {} };
  const wrong = checkAgentCall({ state, config, agentName: "verifier-spec", model: "opus" });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.kind, "agents.model");
  assert.match(wrong.reason, new RegExp(config.agents.verifier.model));

  const missing = checkAgentCall({ state, config, agentName: "verifier-spec" });
  assert.equal(missing.ok, false, "an unset model must not silently inherit the parent tier");

  assert.equal(checkAgentCall({ state, config, agentName: "verifier-spec", model: config.agents.verifier.model }).ok, true);
  assert.equal(checkAgentCall({ state, config, agentName: "Explore", model: "opus" }).ok, true, "built-in agents are unconstrained");
});

// ---------- PreToolUse integration ----------
test("PreToolUse denies over-budget Agent calls and records them for Slack", () => {
  const dir = makeProject({ config: fullConfig({ budget: { maxParallel: 1 } }) });
  const model = fullConfig().agents.verifier.model;

  const first = runHook("pre-tool-use.mjs", agentCall("verifier-spec", model), dir);
  assert.equal(first.code, 0, first.err);

  const second = runHook("pre-tool-use.mjs", agentCall("verifier-test", model), dir);
  assert.equal(second.code, 2);
  assert.match(second.err, /上限 1/);
  assert.equal(JSON.parse(second.out).hookSpecificOutput.permissionDecision, "deny");

  const blocked = readFileSync(join(dir, ".harness/blocked.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(blocked.some((b) => b.kind === "budget.maxParallel"), "the block must be recorded for the workflow to forward");

  // releasing the slot lets the next call through
  const rel = runHook("subagent-stop.mjs", { agent_type: "verifier-spec", agent_id: "a1" }, dir);
  assert.equal(rel.code, 0, rel.err);
  assert.equal(runHook("pre-tool-use.mjs", agentCall("verifier-test", model), dir).code, 0);
});

test("PreToolUse denies a nested Agent call when maxDepth is 1", () => {
  const dir = makeProject({ config: fullConfig() }); // example default maxDepth: 1
  const model = fullConfig().agents.explorer.model;
  runHook("pre-tool-use.mjs", agentCall("explorer", model), dir);
  runHook("subagent-start.mjs", { agent_type: "explorer", agent_id: "child-1" }, dir);
  const nested = runHook("pre-tool-use.mjs", agentCall("explorer", model, { agent_id: "child-1" }), dir);
  assert.equal(nested.code, 2);
  assert.match(nested.err, /入れ子/);
});

test("PreToolUse denies an Agent call with the wrong model tier", () => {
  const dir = makeProject({ config: fullConfig() });
  const r = runHook("pre-tool-use.mjs", agentCall("verifier-spec", "opus"), dir);
  assert.equal(r.code, 2);
  assert.match(r.err, /harness.config.json/);
});

// ---------- explorer output guard ----------
test("checkExplorerOutput rejects long answers and pasted files", () => {
  assert.equal(checkExplorerOutput("## 答え\n- ok\n## 根拠\n- `a.ts:1` — x"), null);
  assert.match(checkExplorerOutput(Array.from({ length: 61 }, (_, i) => `line ${i}`).join("\n")), /60 行/);
  const dump = ["## 答え", "```ts", ...Array.from({ length: 20 }, (_, i) => `const x${i} = ${i};`), "```"].join("\n");
  assert.match(checkExplorerOutput(dump), /貼り付け/);
  const shortQuote = ["## 根拠", "```ts", "const a = 1;", "const b = 2;", "```"].join("\n");
  assert.equal(checkExplorerOutput(shortQuote), null);
});

test("SubagentStop blocks an explorer that pasted a file back", () => {
  const dir = makeProject({ config: fullConfig() });
  const long = Array.from({ length: 80 }, (_, i) => `line ${i}`).join("\n");
  const r = runHook("subagent-stop.mjs", { agent_type: "explorer", agent_id: "e1", last_assistant_message: long }, dir);
  assert.equal(r.code, 2);
  assert.match(r.err, /60 行/);
  // a verifier returning the same text is not the explorer's problem
  assert.equal(runHook("subagent-stop.mjs", { agent_type: "verifier-spec", agent_id: "v1", last_assistant_message: long }, dir).code, 0);
});

// ---------- deterministic merge ----------
const payload = (perspective, o) => "前置き\n\n```json\n" + JSON.stringify({ perspective, ...o }) + "\n```\n";

test("extractPayload takes the last valid json fence", () => {
  assert.equal(extractPayload("```json\n{\"blocking\":[],\"perspective\":\"spec\"}\n```").perspective, "spec");
  assert.equal(extractPayload("```json\n{bad}\n```\n```json\n{\"blocking\":[],\"perspective\":\"test\"}\n```").perspective, "test");
  assert.equal(extractPayload("no json here"), null);
});

test("mergeFindings orders Blocking first, dedupes by file:line, and names missing perspectives", () => {
  const inputs = [
    { name: "verifier-spec", payload: extractPayload(payload("spec", { blocking: [{ file: "b.ts", line: 5, issue: "設計メモに無い変更" }], nit: [{ file: "a.ts", line: 1, issue: "typo" }], checked: ["メモ全 3 件を確認"], notChecked: [] })) },
    { name: "verifier-test", payload: extractPayload(payload("test", { shouldFix: [{ file: "b.ts", line: 5, issue: "テストが実装の写し" }], checked: ["テスト 2 件を確認"], notChecked: ["実行は範囲外"] })) },
    { name: "verifier-security", payload: null }, // this one failed
  ];
  const m = mergeFindings(inputs);
  assert.deepEqual(m.missing, ["verifier-security"]);
  assert.equal(m.counts.blocking, 1);
  assert.equal(m.counts.nit, 1);
  assert.equal(m.findings[0].severity, "blocking", "Blocking comes first");
  const merged = m.findings.find((f) => f.file === "b.ts" && f.line === 5);
  assert.equal(merged.issues.length, 2, "same file:line from two perspectives is one entry");
  assert.equal(merged.severity, "blocking", "the strictest severity wins");

  const md = toMarkdown(m);
  assert.match(md, /Blocking \*\*1\*\*/);
  assert.match(md, /verifier-security は結果を返しませんでした/);
  assert.ok(md.indexOf("Blocking（マージ不可）") < md.indexOf("Nit（任意）"));

  // stable: same inputs in a different order produce the same report
  assert.equal(toMarkdown(mergeFindings([...inputs].reverse())).replace(/verifier-security/g, ""), md.replace(/verifier-security/g, ""));
});

test("mergeFindings keeps checked lists even when nothing was found", () => {
  const m = mergeFindings([{ name: "verifier-spec", payload: extractPayload(payload("spec", { blocking: [], shouldFix: [], nit: [], checked: ["差分 12 ファイルを設計メモと突き合わせた"] })) }]);
  assert.equal(m.counts.blocking, 0);
  assert.match(toMarkdown(m), /差分 12 ファイル/);
});

// ---------- Best-of-N ----------
test("countPasses reads common formats and degrades to pass/fail", () => {
  assert.equal(countPasses("41 passed, 1 skipped", 0), 41);
  assert.equal(countPasses("# pass 20\n# fail 0", 0), 20);
  assert.equal(countPasses("Tests:       7 passed, 7 total", 0), 7);
  assert.equal(countPasses("12 passing", 0), 12);
  assert.equal(countPasses("something unparseable", 0), 1);
  assert.equal(countPasses("something unparseable", 1), 0);
});

test("rank prefers more passes, then a smaller diff, then the path", () => {
  const r = rank([
    { path: "/w/2", passes: 5, diffLines: 10 },
    { path: "/w/1", passes: 9, diffLines: 80 },
    { path: "/w/3", passes: 9, diffLines: 20 },
    { path: "/w/4", passes: 9, diffLines: 20 },
  ]);
  assert.deepEqual(r.map((x) => x.path), ["/w/3", "/w/4", "/w/1", "/w/2"]);
});

test("should-run stays at 1 until the run has visibly stalled", () => {
  const dir = makeProject({ config: fullConfig({ budget: { bestOfN: 3, maxParallel: 4 } }) });
  const run = () => spawnSync("node", [join(REPO, "scripts/bestofn/should-run.mjs")], {
    cwd: dir, encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, HARNESS_CONFIG: join(dir, ".claude/harness.config.json") },
  }).stdout.trim();

  assert.equal(run(), "1", "no state at all");
  mkdirSync(join(dir, ".harness/state"), { recursive: true });
  writeFileSync(join(dir, ".harness/state/attempts.json"), JSON.stringify({ testFailStreak: 1, blockingRetries: 0 }));
  assert.equal(run(), "1", "one failure is not enough");
  writeFileSync(join(dir, ".harness/state/attempts.json"), JSON.stringify({ testFailStreak: 2, blockingRetries: 0 }));
  assert.equal(run(), "3", "two consecutive test failures arm it");
  writeFileSync(join(dir, ".harness/state/attempts.json"), JSON.stringify({ testFailStreak: 0, blockingRetries: 2 }));
  assert.equal(run(), "3", "blocking findings surviving two rounds also arm it");
});

test("should-run never exceeds the parallel budget", () => {
  const dir = makeProject({ config: fullConfig({ budget: { bestOfN: 5, maxParallel: 2 } }) });
  mkdirSync(join(dir, ".harness/state"), { recursive: true });
  writeFileSync(join(dir, ".harness/state/attempts.json"), JSON.stringify({ testFailStreak: 3, blockingRetries: 0 }));
  const out = spawnSync("node", [join(REPO, "scripts/bestofn/should-run.mjs")], {
    cwd: dir, encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, HARNESS_CONFIG: join(dir, ".claude/harness.config.json") },
  }).stdout.trim();
  assert.equal(out, "2");
});

test("there is no configuration path that turns Best-of-N on permanently", () => {
  const schema = JSON.parse(readFileSync(join(REPO, ".claude/harness.config.schema.json"), "utf8"));
  const keys = Object.keys(schema.properties.budget.properties);
  assert.ok(!keys.some((k) => /always|force|enable/i.test(k)), `budget must not gain an always-on switch: ${keys.join(",")}`);
  const src = readFileSync(join(REPO, "scripts/bestofn/should-run.mjs"), "utf8");
  assert.match(src, /THRESHOLD = 2/, "the arming threshold stays in code, not in config");
});

test("bestofn/run refuses to recurse into itself", () => {
  const dir = makeProject({ config: fullConfig() });
  const r = spawnSync("node", [join(REPO, "scripts/bestofn/run.mjs"), "docs/plans/x.md"], {
    cwd: dir, encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, HARNESS_BESTOFN_ACTIVE: "1" },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /再帰防止/);
});

// ---------- review gate ----------
test("the review gate stays closed while the deterministic checks fail", () => {
  const dir = makeProject({ config: fullConfig({ commands: { lint: "echo boom >&2; false", typecheck: "", test: "true" } }) });
  const closed = spawnSync("node", [join(REPO, "scripts/review/gate.mjs")], {
    cwd: dir, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir, HARNESS_CONFIG: join(dir, ".claude/harness.config.json") },
  });
  assert.equal(closed.status, 1);
  assert.match(closed.stdout, /^CLOSED/);
  assert.match(closed.stdout, /boom/);

  writeFileSync(join(dir, ".claude/harness.config.json"), JSON.stringify(fullConfig()));
  const open = spawnSync("node", [join(REPO, "scripts/review/gate.mjs")], {
    cwd: dir, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir, HARNESS_CONFIG: join(dir, ".claude/harness.config.json") },
  });
  assert.equal(open.status, 0);
  assert.match(open.stdout, /^OPEN/);
});

test("the gate exits 0 in advisory mode so an injected command cannot abort /review", () => {
  // A non-zero exit from a `!`...`` injection aborts the whole slash-command
  // invocation before Claude reads any of its instructions, so the CLOSED verdict has
  // to arrive as text. /review injects the gate with --advisory for exactly this.
  const dir = makeProject({ config: fullConfig({ commands: { lint: "false", typecheck: "", test: "true" } }) });
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir, HARNESS_CONFIG: join(dir, ".claude/harness.config.json") };
  const advisory = spawnSync("node", [join(REPO, "scripts/review/gate.mjs"), "--advisory"], { cwd: dir, encoding: "utf8", env });
  assert.equal(advisory.status, 0, "advisory must never exit non-zero");
  assert.match(advisory.stdout, /^CLOSED/, "the verdict still has to be readable");

  const cmd = readFileSync(join(REPO, ".claude/commands/review.md"), "utf8");
  assert.match(cmd, /!`node scripts\/review\/gate\.mjs --advisory`/, "/review must inject the advisory form");
});

// ---------- config gate ----------
test("/review joins /plan and /implement behind the config gate", () => {
  const empty = makeProject();
  for (const cmd of ["/plan x", "/implement docs/plans/x.md", "/review"]) {
    const r = runHook("require-config.mjs", { prompt: cmd }, empty);
    assert.equal(r.code, 2, cmd);
    assert.match(r.err, /agents\.planner\.model/);
  }
  assert.equal(runHook("require-config.mjs", { prompt: "/verify" }, empty).code, 0);

  const partial = makeProject({ config: fullConfig({ agents: { verifier: { model: "" } } }) });
  const r = runHook("require-config.mjs", { prompt: "/review" }, partial);
  assert.equal(r.code, 2);
  assert.match(r.err, /agents\.verifier\.model/);

  assert.equal(runHook("require-config.mjs", { prompt: "/review" }, makeProject({ config: fullConfig() })).code, 0);
});
