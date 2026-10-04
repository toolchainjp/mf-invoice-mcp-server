#!/usr/bin/env node
// Sends one harness event to Slack (chat.postMessage), threading all messages
// for the same Issue/PR under one parent. Runs only from GitHub Actions.
//
//   node scripts/notify/send.mjs --event pr.opened --payload '{"repo":"o/r","number":12,...}' [--thread-key o/r#12]
//
// Env:  SLACK_BOT_TOKEN   (from the secret named in config.slack.tokenSecretName)
//       GITHUB_TOKEN      (to store/find the thread ts in a hidden Issue/PR comment)
//       HARNESS_CONFIG    (optional path; default .claude/harness.config.json)
// Exit code is always 0 unless --strict: notification failure must never fail a workflow.
import { readFileSync, existsSync } from "node:fs";
import { buildMessage, EVENTS } from "./build-message.mjs";

export const THREAD_MARKER = "<!-- harness-slack-thread:";

export function parseArgs(argv) {
  const out = { strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--strict") out.strict = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  return out;
}

export function loadConfig(path) {
  const p = path || process.env.HARNESS_CONFIG || ".claude/harness.config.json";
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

/** Decides whether to send at all. Returns a reason string when skipping. */
export function skipReason({ event, config, token }) {
  if (!config) return "harness.config.json not found";
  if (!EVENTS.includes(event)) return `unknown event ${event}`;
  if (!config.slack?.channel) return "slack.channel is empty";
  if (config.slack.events?.[event] === false) return `event ${event} disabled in config`;
  if (!token) return "Slack token env is empty";
  return null;
}

const GH = "https://api.github.com";
async function ghJson(url, token, init = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`GitHub ${init.method || "GET"} ${url} -> ${r.status}`);
  return r.json();
}

/** thread key "owner/repo#123" -> existing Slack ts stored in a hidden comment, or null. */
export async function findThreadTs(threadKey, ghToken) {
  const m = /^([^/]+\/[^#]+)#(\d+)$/.exec(threadKey || "");
  if (!m || !ghToken) return null;
  const comments = await ghJson(`${GH}/repos/${m[1]}/issues/${m[2]}/comments?per_page=100`, ghToken);
  for (const c of comments) {
    const i = (c.body || "").indexOf(THREAD_MARKER);
    if (i >= 0) return c.body.slice(i + THREAD_MARKER.length).split("-->")[0].trim();
  }
  return null;
}

export async function storeThreadTs(threadKey, ts, ghToken) {
  const m = /^([^/]+\/[^#]+)#(\d+)$/.exec(threadKey || "");
  if (!m || !ghToken) return;
  await ghJson(`${GH}/repos/${m[1]}/issues/${m[2]}/comments`, ghToken, {
    method: "POST",
    body: JSON.stringify({ body: `${THREAD_MARKER} ${ts} -->\n_Slack 通知スレッドを紐付けました（自動コメント）。_` }),
  });
}

export async function postToSlack({ token, channel, message, threadTs }, fetchImpl = fetch) {
  const body = { channel, text: message.text, blocks: message.blocks, unfurl_links: false };
  if (threadTs) body.thread_ts = threadTs;
  const r = await fetchImpl("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  if (!json.ok) throw new Error(`Slack error: ${json.error}`);
  return json.ts;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const config = loadConfig(args.config);
  const tokenName = config?.slack?.tokenSecretName || "SLACK_BOT_TOKEN";
  const token = env[tokenName] || env.SLACK_BOT_TOKEN || "";
  const reason = skipReason({ event: args.event, config, token });
  if (reason) {
    console.log(`::warning::Slack notification skipped: ${reason}`);
    return 0;
  }
  let payload = {};
  try { payload = args.payload ? JSON.parse(args.payload) : {}; } catch (e) { console.log(`::warning::invalid --payload JSON: ${e.message}`); }
  if (args["payload-file"]) payload = { ...payload, ...JSON.parse(readFileSync(args["payload-file"], "utf8")) };

  const message = buildMessage(args.event, payload, config);
  const threadKey = args["thread-key"] || (payload.repo && payload.number ? `${payload.repo}#${payload.number}` : "");
  let threadTs = null;
  try { threadTs = await findThreadTs(threadKey, env.GITHUB_TOKEN); } catch (e) { console.log(`::warning::thread lookup failed: ${e.message}`); }
  const ts = await postToSlack({ token, channel: config.slack.channel, message, threadTs });
  if (!threadTs && threadKey) {
    try { await storeThreadTs(threadKey, ts, env.GITHUB_TOKEN); } catch (e) { console.log(`::warning::thread store failed: ${e.message}`); }
  }
  console.log(`Slack: sent ${args.event} to ${config.slack.channel}${threadTs ? ` (thread ${threadTs})` : ""}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((c) => process.exit(c)).catch((e) => {
    console.log(`::warning::Slack notification failed: ${e.message}`);
    process.exit(process.argv.includes("--strict") ? 1 : 0);
  });
}
