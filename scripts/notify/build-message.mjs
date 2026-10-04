// Builds a Slack Block Kit message for one harness event.
// Pure function: (event, payload, config) -> { text, blocks, mention }.
// Rules (see docs/agent-harness/POLICY.md):
//   - at most 10 lines; bad news first; details live behind GitHub links
//   - never include diffs, full logs, file contents or secret-looking strings
//   - mention approvers only when a human decision is needed

export const EVENTS = ["plan.ready", "escalation", "pr.opened", "verify.report", "blocked", "ci.failed", "eval.failed", "deploy.done"];

const SECRET_RES = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
  /\bsk-[A-Za-z0-9]{32,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{60,}\b/g,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
  /((?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*)["']?[^"'\s]{8,}["']?/gi,
];

/** Removes secrets, code fences and diff lines; collapses whitespace; caps length. */
export function sanitize(text, max = 300) {
  let s = String(text ?? "");
  s = s.replace(/```[\s\S]*?```/g, "[code omitted]");
  s = s
    .split("\n")
    .filter((l) => !/^(\+\+\+|---|@@|[+-](?![+-]))/.test(l) && !/^(diff --git|index [0-9a-f]+\.\.)/.test(l))
    .join("\n");
  for (const re of SECRET_RES) s = s.replace(re, (m, g1) => (typeof g1 === "string" ? `${g1}[redacted]` : "[redacted]"));
  s = s.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function mentions(config) {
  const ids = config.slack?.approverSlackIds ?? {};
  return (config.approvers ?? []).map((h) => (ids[h] ? `<@${ids[h]}>` : `@${h}`)).join(" ");
}

const line = (s) => ({ type: "section", text: { type: "mrkdwn", text: s } });
const ctx = (s) => ({ type: "context", elements: [{ type: "mrkdwn", text: s }] });
const link = (url, label) => (url ? `<${url}|${label}>` : label);
const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/**
 * @param {string} event one of EVENTS
 * @param {object} payload event-specific fields (see scripts/notify/README.md)
 * @param {object} config harness.config.json
 */
export function buildMessage(event, payload = {}, config = {}) {
  if (!EVENTS.includes(event)) throw new Error(`unknown event: ${event}`);
  const p = Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, typeof v === "string" ? sanitize(v) : v]));
  const repo = p.repo ? sanitize(p.repo, 100) : "";
  const ref = p.number ? `${repo}#${p.number}` : repo;
  const title = p.title ? ` — ${sanitize(p.title, 80)}` : "";
  const who = config.slack?.mentionApprovers ? mentions(config) : "";
  const lines = [];
  let mention = false;

  switch (event) {
    case "plan.ready": {
      mention = true;
      lines.push(`:clipboard: *設計メモが出ました* ${link(p.url, ref)}${title}`);
      if (n(p.questions) > 0) lines.push(`:question: 未回答の質問 *${n(p.questions)} 件* — 回答が必要です`);
      lines.push(`承認するには GitHub 上で設計メモにコメントしてください。`);
      break;
    }
    case "escalation": {
      mention = true;
      lines.push(`:raised_hand: *エージェントが判断を求めて停止* ${link(p.url, ref)}${title}`);
      if (p.summary) lines.push(`> ${p.summary}`);
      lines.push(`回答は GitHub のスレッドに書いてください（Slack では受け付けません）。`);
      break;
    }
    case "pr.opened": {
      const b = n(p.blocking), s = n(p.shouldFix), t = n(p.nit);
      mention = b > 0;
      lines.push(`${b > 0 ? ":rotating_light:" : ":white_check_mark:"} *PR 作成* ${link(p.url, ref)}${title}`);
      lines.push(`レビュアー: Blocking *${b}* / Should fix ${s} / Nit ${t}`);
      // Reading order, not a description of the change: the first groups are where a
      // reviewer should start. The diagram, if any, stays in the PR body.
      const groups = (p.groups ?? []).filter((g) => g && g.label);
      if (groups.length) {
        const head = groups.slice(0, 3).map((g) => `${sanitize(g.label, 24)}(${n(g.files)})`).join(" → ");
        const rest = groups.length > 3 ? ` …他 ${groups.length - 3} グループ` : "";
        lines.push(`読み順: ${head}${rest}`);
      }
      for (const item of (p.blockingItems ?? []).slice(0, b > 0 ? 4 : 0)) lines.push(`• ${sanitize(item, 120)}`);
      break;
    }
    case "verify.report": {
      const unverified = (p.unverified ?? []).map((x) => sanitize(x, 100));
      lines.push(`${unverified.length ? ":warning:" : ":white_check_mark:"} *検証報告* ${link(p.url, ref)}${title}`);
      if (unverified.length) {
        lines.push(`*未確認 ${unverified.length} 件*:`);
        for (const u of unverified.slice(0, 4)) lines.push(`• ${u}`);
      }
      for (const v of (p.verified ?? []).slice(0, 3)) lines.push(`✓ ${sanitize(v, 100)}`);
      break;
    }
    case "blocked": {
      lines.push(`:no_entry: *ブロック* ${link(p.url, ref)}${title}`);
      lines.push(`種別: ${sanitize(p.kind ?? "unknown", 40)}${p.reason ? ` — ${sanitize(p.reason, 160)}` : ""}`);
      break;
    }
    case "ci.failed":
    case "eval.failed": {
      lines.push(`:x: *${event === "ci.failed" ? "CI" : "Eval"} 失敗* ${link(p.url, ref)}${title}`);
      lines.push(`ジョブ: ${sanitize(p.job ?? "?", 80)}${p.runUrl ? ` — ${link(p.runUrl, "ログ")}` : ""}`);
      break;
    }
    case "deploy.done": {
      lines.push(`:rocket: *デプロイ完了* ${repo}${p.target ? ` → ${sanitize(p.target, 40)}` : ""}`);
      if (p.deployUrl) lines.push(link(p.deployUrl, p.deployUrl));
      if (p.runUrl) lines.push(link(p.runUrl, "ワークフローログ"));
      break;
    }
  }
  if (mention && who) lines.unshift(who);
  const capped = lines.slice(0, 10);
  const blocks = capped.map(line);
  blocks.push(ctx(`event: ${event}` + (p.actor ? ` · by ${sanitize(p.actor, 40)}` : "")));
  return { text: capped[0].replace(/[*_>]/g, ""), blocks, mention };
}
