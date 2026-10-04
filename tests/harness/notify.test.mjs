// Tests for scripts/notify. No network: fetch is stubbed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildMessage, sanitize, EVENTS } from "../../scripts/notify/build-message.mjs";
import { skipReason, findThreadTs, postToSlack, parseArgs, main, THREAD_MARKER } from "../../scripts/notify/send.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const baseConfig = () => {
  const c = JSON.parse(readFileSync(join(REPO, ".claude/harness.config.example.json"), "utf8"));
  c.approvers = ["alice", "bob"];
  c.slack.channel = "C0123456789";
  c.slack.approverSlackIds = { alice: "U111" };
  return c;
};

const SECRET_KEY = "AKIA" + "IOSFODNN7EXAMPLE";
const PEM = "-----BEGIN RSA " + "PRIVATE KEY-----\nMIIabc\n-----END RSA " + "PRIVATE KEY-----";

test("sanitize removes secrets, code fences and diff lines", () => {
  const out = sanitize(`token = "${"ghp_" + "a".repeat(40)}"\nkey ${SECRET_KEY}\n\`\`\`\ncode\n\`\`\`\n+++ b/x\n+added line\n-removed\n@@ -1 +1 @@\nplain text ${PEM}`);
  assert.ok(!out.includes("ghp_"), out);
  assert.ok(!out.includes(SECRET_KEY), out);
  assert.ok(!out.includes("PRIVATE KEY-----\nMII"), out);
  assert.ok(!out.includes("added line"), out);
  assert.ok(!out.includes("\ncode"), out);
  assert.match(out, /plain text/);
  assert.match(out, /\[redacted\]/);
});

test("every event builds a Block Kit message with <= 10 lines and no secrets", () => {
  const config = baseConfig();
  const payload = {
    repo: "toolchainjp/x", number: 7, title: `Add login ${SECRET_KEY}`, url: "https://github.com/toolchainjp/x/pull/7", actor: "claude[bot]",
    questions: 2, summary: `Which DB? see ${PEM}`, blocking: 1, shouldFix: 2, nit: 3, blockingItems: ["src/a.py:10 — SQL injection", `token xoxb-${"1".repeat(20)}`],
    verified: ["pytest → 12 passed"], unverified: ["integration test (no network)"], kind: "tier3", reason: "curl blocked",
    job: "harness-tests", runUrl: "https://github.com/x/actions/runs/1", target: "cloudflare", deployUrl: "https://app.example.com",
  };
  for (const event of EVENTS) {
    const m = buildMessage(event, payload, config);
    const text = JSON.stringify(m);
    assert.ok(Array.isArray(m.blocks) && m.blocks.length > 0, event);
    assert.ok(m.blocks.filter((b) => b.type === "section").length <= 10, event);
    assert.ok(!text.includes(SECRET_KEY), `${event} leaks AKIA`);
    assert.ok(!text.includes("MIIabc"), `${event} leaks PEM`);
    assert.ok(!text.includes("xoxb-"), `${event} leaks slack token`);
    assert.match(text, /github\.com/, `${event} links to GitHub`);
  }
});

test("mentions approvers only when a decision is needed", () => {
  const config = baseConfig();
  const p = { repo: "o/r", number: 1, url: "https://github.com/o/r/pull/1" };
  const has = (m) => JSON.stringify(m.blocks).includes("<@U111>");
  assert.ok(has(buildMessage("plan.ready", p, config)));
  assert.ok(has(buildMessage("escalation", p, config)));
  assert.ok(has(buildMessage("pr.opened", { ...p, blocking: 1 }, config)));
  assert.ok(!has(buildMessage("pr.opened", { ...p, blocking: 0 }, config)));
  assert.ok(!has(buildMessage("verify.report", p, config)));
  assert.ok(!has(buildMessage("ci.failed", p, config)));
  assert.ok(!has(buildMessage("deploy.done", p, config)));
  // handle without a Slack ID is rendered as plain text, never as a broken mention
  assert.match(JSON.stringify(buildMessage("plan.ready", p, config).blocks), /@bob/);
  config.slack.mentionApprovers = false;
  assert.ok(!has(buildMessage("plan.ready", p, config)));
});

test("bad news comes first", () => {
  const m = buildMessage("verify.report", { repo: "o/r", number: 1, verified: ["a"], unverified: ["b"] }, baseConfig());
  const texts = m.blocks.filter((b) => b.type === "section").map((b) => b.text.text);
  assert.match(texts[0], /warning/);
  assert.ok(texts.findIndex((t) => t.includes("未確認")) < texts.findIndex((t) => t.startsWith("✓")));
});

test("skipReason: empty channel, disabled event, missing token, missing config", () => {
  const config = baseConfig();
  assert.equal(skipReason({ event: "ci.failed", config, token: "x" }), null);
  assert.match(skipReason({ event: "ci.failed", config: null, token: "x" }), /not found/);
  assert.match(skipReason({ event: "ci.failed", config: { ...config, slack: { ...config.slack, channel: "" } }, token: "x" }), /channel/);
  assert.match(skipReason({ event: "ci.failed", config, token: "" }), /token/);
  const off = baseConfig(); off.slack.events["ci.failed"] = false;
  assert.match(skipReason({ event: "ci.failed", config: off, token: "x" }), /disabled/);
  assert.match(skipReason({ event: "nope", config, token: "x" }), /unknown/);
});

test("main() exits 0 and skips when config has no channel (workflow never fails)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "notify-"));
  const cfg = join(dir, "harness.config.json");
  writeFileSync(cfg, JSON.stringify(baseConfig()).replace("C0123456789", ""));
  const logs = [];
  const orig = console.log; console.log = (s) => logs.push(s);
  try {
    const code = await main(["--event", "ci.failed", "--payload", "{}", "--config", cfg], { SLACK_BOT_TOKEN: "x" });
    assert.equal(code, 0);
    assert.match(logs.join("\n"), /skipped: slack.channel is empty/);
  } finally { console.log = orig; }
});

test("thread ts is reused from the hidden Issue comment", async () => {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.includes("/issues/12/comments")) {
      return { ok: true, json: async () => [{ body: "hello" }, { body: `${THREAD_MARKER} 1700000000.000100 -->\n_auto_` }] };
    }
    if (url.includes("/issues/13/comments")) return { ok: true, json: async () => [] };
    if (url.includes("slack.com")) return { ok: true, json: async () => ({ ok: true, ts: "1700000000.000200" }) };
    throw new Error("unexpected " + url);
  };
  globalThis.fetch = fakeFetch;
  assert.equal(await findThreadTs("o/r#12", "ghtoken"), "1700000000.000100");
  assert.equal(await findThreadTs("o/r#13", "ghtoken"), null);
  assert.equal(await findThreadTs("not-a-key", "ghtoken"), null);

  const message = buildMessage("ci.failed", { repo: "o/r", number: 12 }, baseConfig());
  const ts = await postToSlack({ token: "t", channel: "C1", message, threadTs: "1700000000.000100" }, fakeFetch);
  assert.equal(ts, "1700000000.000200");
  const slackCall = calls.find((c) => c.url.includes("slack.com"));
  const body = JSON.parse(slackCall.init.body);
  assert.equal(body.thread_ts, "1700000000.000100");
  assert.equal(body.channel, "C1");
  assert.ok(Array.isArray(body.blocks));
});

test("parseArgs", () => {
  assert.deepEqual(parseArgs(["--event", "x", "--payload", "{}", "--strict"]), { event: "x", payload: "{}", strict: true });
});
