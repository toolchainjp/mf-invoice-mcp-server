// Tests for the PR walkthrough: grouping, reading order, the diagram condition,
// idempotent PR-body updates, and the Slack summary staying within its budget.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { classify, groupFor, parseNumstat, GROUPS } from "../../scripts/walkthrough/classify.mjs";
import { buildWalkthrough, countUnverified, findPlanPath, START, END } from "../../scripts/walkthrough/build.mjs";
import { applyBlock } from "../../scripts/walkthrough/update-pr-body.mjs";
import { needsDiagram } from "../../scripts/walkthrough/needs-diagram.mjs";
import { buildMessage } from "../../scripts/notify/build-message.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const f = (path, added = 1, removed = 0) => ({ path, added, removed });

// ---------- classification ----------
test("files land in the group a reviewer expects", () => {
  const cases = {
    "db/migrations/001_add_users.sql": "schema",
    "prisma/schema.prisma": "schema",
    "api/openapi.yaml": "schema",
    "src/types/user.d.ts": "types",
    "src/types.ts": "types",
    "src/services/billing.py": "logic",
    "lib/util.go": "logic",
    "src/routes/users.ts": "callers",
    "app/controllers/session_controller.rb": "callers",
    "src/components/Button.tsx": "ui",
    "styles/main.css": "ui",
    "tests/harness/run.sh": "tests",
    "src/billing.test.ts": "tests",
    "app/test_billing.py": "tests",
    ".github/workflows/ci.yml": "config",
    "package.json": "config",
    "tsconfig.json": "config",
    ".gitignore": "config",
    ".coderabbit.yaml.example": "config",
    ".claude/agents/verifier-spec.md": "config",
    ".claude/commands/review.md": "config",
    ".claude/harness.config.example.json": "config",
    "README.md": "docs",
    "docs/agent-harness/POLICY.md": "docs",
    "LICENSE": "other",
  };
  for (const [path, expected] of Object.entries(cases)) {
    assert.equal(groupFor(path), expected, `${path} should be ${expected}, got ${groupFor(path)}`);
  }
});

test("a test file under src/ is a test, and a .tsx file is UI", () => {
  assert.equal(groupFor("src/lib/thing.test.ts"), "tests", "tests win over logic");
  assert.equal(groupFor("src/pages/Home.tsx"), "ui", "ui wins over logic");
  assert.equal(groupFor("src/routes/api.tsx"), "ui", "extension is the stronger signal than the directory");
});

test("harness definitions are configuration, not call sites or prose", () => {
  // `.claude/commands/` would otherwise match the generic `commands/` caller rule, and
  // `.claude/agents/*.md` would land in docs. Both are settings a reviewer reads as such.
  assert.equal(groupFor(".claude/commands/plan.md"), "config");
  assert.equal(groupFor(".claude/agents/explorer.md"), "config");
  assert.equal(groupFor(".claude/hooks/stop.mjs"), "config");
  // A real caller directory is unaffected.
  assert.equal(groupFor("src/commands/deploy.ts"), "callers");
  // An OpenAPI document stays schema even though it is JSON.
  assert.equal(groupFor("api/openapi.json"), "schema");
});

test("classify returns reading order and drops empty groups", () => {
  const groups = classify([f("src/routes/a.ts"), f("db/migrations/1.sql"), f("README.md"), f("src/service.ts")]);
  assert.deepEqual(groups.map((g) => g.key), ["schema", "logic", "callers", "docs"]);
  assert.ok(groups.every((g) => g.files.length > 0));
  const order = GROUPS.map((g) => g.key);
  const positions = groups.map((g) => order.indexOf(g.key));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "groups come back in the fixed reading order");
});

test("classify is stable regardless of input order", () => {
  const files = [f("src/a.ts"), f("tests/a.test.ts"), f("db/migrations/1.sql")];
  const a = JSON.stringify(classify(files));
  const b = JSON.stringify(classify([...files].reverse()));
  assert.equal(a, b);
});

test("parseNumstat handles binary files and renames", () => {
  const parsed = parseNumstat("10\t2\tsrc/a.ts\n-\t-\timg/logo.png\n3\t0\tsrc/{old => new}/b.ts");
  assert.deepEqual(parsed[0], { path: "src/a.ts", added: 10, removed: 2 });
  assert.deepEqual(parsed[1], { path: "img/logo.png", added: 0, removed: 0 });
  assert.equal(parsed[2].added, 3);
  assert.ok(parsed[2].path.includes("new"), "a rename points at the new path");
});

// ---------- walkthrough block ----------
test("the walkthrough lists groups in order and surfaces the unverified count", () => {
  const md = buildWalkthrough({
    files: [f("db/migrations/1.sql", 20), f("src/service.ts", 30, 5), f("tests/service.test.ts", 40)],
    planPath: "docs/plans/2026-01-01-x.md",
    unverified: 2,
    repo: "o/r",
    sha: "abc123",
  });
  assert.ok(md.startsWith(START) && md.trimEnd().endsWith(END));
  assert.match(md, /変更 \*\*3 ファイル\*\*/);
  assert.ok(md.indexOf("スキーマ") < md.indexOf("ロジック"), "schema is read before logic");
  assert.ok(md.indexOf("ロジック") < md.indexOf("テスト"), "logic is read before tests");
  assert.match(md, /docs\/plans\/2026-01-01-x\.md/);
  assert.match(md, /「確認できなかったこと」: \*\*2 件\*\*/);
  assert.ok(!md.includes("```mermaid"), "no diagram unless one was supplied");
});

test("the walkthrough says so when the memo or the report is missing", () => {
  const md = buildWalkthrough({ files: [f("src/a.ts")], planPath: null, unverified: null });
  assert.match(md, /設計メモ: \*\*PR 本文にリンクがありません\*\*/);
  assert.match(md, /検証報告: \*\*PR 本文にありません\*\*/);
});

test("a supplied diagram is always labelled as generated and unverified", () => {
  const md = buildWalkthrough({
    files: [f("src/a.ts")],
    diagram: "sequenceDiagram\n  A->>B: call",
    diagramReasons: "外部 API 呼び出しの追加・変更",
  });
  assert.match(md, /```mermaid/);
  assert.match(md, /自動生成・要確認/);
  assert.match(md, /Should fix として扱ってください/);
  assert.match(md, /外部 API 呼び出しの追加・変更/);
});

test("countUnverified and findPlanPath read the verification report", () => {
  const body = [
    "## 概要", "x", "設計メモ: docs/plans/2026-02-02-y.md", "",
    "### 確認できたこと（実行して検証済み）", "- a", "- b", "",
    "### 確認できなかったこと・未確認", "- 統合テスト未実行", "- 型検査は未設定", "",
    "### 判断が必要な点", "- なし",
  ].join("\n");
  assert.equal(countUnverified(body), 2, "only the bullets under the unverified heading count");
  assert.equal(findPlanPath(body), "docs/plans/2026-02-02-y.md");
  assert.equal(countUnverified("## 概要\nno report here"), null);
  assert.equal(countUnverified("### 確認できなかったこと\n- （報告なし）"), 0);
});

// ---------- idempotent body update ----------
test("applying the block twice leaves one block and keeps human text", () => {
  const human = "## 概要\n人が書いた説明\n\n## テスト項目\n- [x] a";
  const block1 = `${START}\n## 📋 ウォークスルー（自動生成）\nv1\n${END}`;
  const block2 = `${START}\n## 📋 ウォークスルー（自動生成）\nv2\n${END}`;

  const once = applyBlock(human, block1);
  assert.ok(once.startsWith(START), "the block goes on top");
  assert.match(once, /人が書いた説明/);

  const twice = applyBlock(once, block2);
  assert.equal(twice.split(START).length - 1, 1, "exactly one block survives");
  assert.match(twice, /v2/);
  assert.ok(!twice.includes("v1"), "the old block is replaced, not appended");
  assert.match(twice, /人が書いた説明/, "human text is never dropped");
  assert.match(twice, /- \[x\] a/);

  assert.equal(applyBlock(twice, block2).trim(), twice.trim(), "re-applying the same block is a no-op");
});

// ---------- diagram condition ----------
const diffOf = (...lines) => lines.map((l) => `+${l}`).join("\n");

test("a diagram is drawn only when interactions change", () => {
  assert.equal(needsDiagram(diffOf("const r = await fetch('https://api.example.com')")).needed, true);
  assert.equal(needsDiagram(diffOf("resp = requests.post(url, json=body)")).needed, true);
  assert.equal(needsDiagram(diffOf("bus.emit('user.created', user)")).needed, true);
  assert.equal(needsDiagram(diffOf("@shared_task", "def rebuild_index():")).needed, true);
  assert.equal(needsDiagram(diffOf("if not authorize(user, 'admin'):")).needed, true);
  assert.equal(needsDiagram("", ["src/auth/session.ts"]).needed, true, "the path alone can trigger it");
  assert.equal(needsDiagram("", ["src/workers/reindex.py"]).needed, true);
});

test("ordinary changes do not get a diagram", () => {
  assert.equal(needsDiagram(diffOf("const total = price * quantity;")).needed, false);
  assert.equal(needsDiagram(diffOf("- 見出しを直した"), ["README.md"]).needed, false);
  assert.equal(needsDiagram(diffOf("def add(a, b):", "    return a + b"), ["src/math.py"]).needed, false);
  assert.equal(needsDiagram(diffOf("assert add(1, 2) == 3"), ["tests/test_math.py"]).needed, false);
});

test("everyday words that merely look like auth do not trigger a diagram", () => {
  // These all appear in this repository's own harness code. An earlier, looser pattern
  // fired on every one of them and claimed the auth flow had changed.
  const innocuous = [
    "claude -p x --no-session-persistence",
    '  "role": "設計メモ・タスク分解・最終判断"',
    "permissionMode: default",
    "tokenSecretName: SLACK_BOT_TOKEN",
    "const subagent_tokens = 10406;",
    "session_id: input.session_id,",
    "if (config.slack.mentionApprovers) {",
  ];
  const r = needsDiagram(diffOf(...innocuous), [".claude/hooks/state.mjs", "scripts/notify/send.mjs"]);
  assert.equal(r.needed, false, `false positive: ${r.reasons.join(", ")}`);
});

test("prose in documentation does not trigger a diagram", () => {
  // A design memo explaining that the harness authenticates with OAuth is not a change
  // to the auth flow. Only added lines in non-documentation files are scanned.
  const diff = [
    "diff --git a/docs/agent-harness/PLAN.md b/docs/agent-harness/PLAN.md",
    "@@ -1,0 +1,2 @@",
    "+- サブスク（OAuth）認証のため金額上限は設定できない",
    "+- 子は `CLAUDE_CODE_OAUTH_TOKEN` を継承する",
    "diff --git a/README.md b/README.md",
    "@@ -1,0 +1,1 @@",
    "+`await fetch(url)` のように書きます",
  ].join("\n");
  const r = needsDiagram(diff, ["docs/agent-harness/PLAN.md", "README.md"]);
  assert.equal(r.needed, false, `false positive from prose: ${r.reasons.join(", ")}`);

  // The same words in real code still count.
  const code = [
    "diff --git a/src/auth.ts b/src/auth.ts",
    "@@ -1,0 +1,1 @@",
    "+const payload = jwt.decode(access_token);",
  ].join("\n");
  assert.equal(needsDiagram(code, ["src/auth.ts"]).needed, true);
});

test("real auth changes still trigger a diagram", () => {
  assert.equal(needsDiagram(diffOf("const ok = await authorize(user, 'admin');")).needed, true);
  assert.equal(needsDiagram(diffOf("payload = jwt.decode(access_token)")).needed, true);
  assert.equal(needsDiagram(diffOf("@login_required")).needed, true);
  assert.equal(needsDiagram("", ["src/auth/session.ts"]).needed, true);
});

test("only added lines trigger a diagram", () => {
  const removed = ["-const r = await fetch('https://api.example.com')", " const x = 1;"].join("\n");
  assert.equal(needsDiagram(removed).needed, false, "removing a call does not need a new picture");
  const header = "+++ b/src/fetch-helper.ts";
  assert.equal(needsDiagram(header).needed, false, "diff headers are not code");
});

test("the reasons name every trigger that fired", () => {
  const r = needsDiagram(diffOf("await fetch(url)", "queue.emit('done')"));
  assert.equal(r.reasons.length, 2);
  assert.match(r.reasons.join(","), /外部 API/);
  assert.match(r.reasons.join(","), /イベント/);
});

// ---------- Slack summary ----------
test("pr.opened carries the reading order and stays within 10 lines", () => {
  const config = JSON.parse(readFileSync(join(REPO, ".claude/harness.config.example.json"), "utf8"));
  config.approvers = ["alice"];
  config.slack.channel = "C1";
  const groups = GROUPS.map((g, i) => ({ label: g.label, files: i + 1 }));
  const m = buildMessage(
    "pr.opened",
    {
      repo: "o/r", number: 3, url: "https://github.com/o/r/pull/3", title: "t",
      blocking: 2, shouldFix: 1, nit: 5, blockingItems: ["a.ts:1 — x", "b.ts:2 — y", "c.ts:3 — z", "d.ts:4 — w", "e.ts:5 — v"],
      groups,
    },
    config,
  );
  const sections = m.blocks.filter((b) => b.type === "section");
  assert.ok(sections.length <= 10, `10 行以内に収まること (got ${sections.length})`);
  const text = sections.map((s) => s.text.text).join("\n");
  assert.match(text, /読み順: /);
  assert.match(text, /…他 6 グループ/, "only the first three groups are named");
  assert.ok(!text.includes("```"), "no diagram or code goes to Slack");
});

test("pr.opened without groups still works and drops blocking items when clean", () => {
  const config = JSON.parse(readFileSync(join(REPO, ".claude/harness.config.example.json"), "utf8"));
  config.slack.channel = "C1";
  const clean = buildMessage("pr.opened", { repo: "o/r", number: 1, blocking: 0, blockingItems: ["x"] }, config);
  const text = JSON.stringify(clean.blocks);
  assert.ok(!text.includes("読み順"), "no groups, no reading-order line");
  assert.ok(!text.includes("• x"), "blocking items are only listed when something blocks");
});
