#!/usr/bin/env node
// Decides whether a pull request warrants a sequence diagram. A diagram is worth the
// tokens only when the change alters how parts talk to each other; for everything else
// the file grouping already tells the reviewer what to read.
//
//   node scripts/walkthrough/needs-diagram.mjs [base-ref] [--json]
//
// The decision is made from paths and added lines with fixed patterns. No model is
// involved, so the same diff always gives the same answer.
import { execSync } from "node:child_process";
import { groupFor } from "./classify.mjs";

export const TRIGGERS = [
  {
    key: "external-api",
    label: "外部 API 呼び出しの追加・変更",
    line: /\b(fetch|axios|got|superagent|ky)\s*[(.]|\brequests\.(get|post|put|patch|delete)\b|\bhttpx\.|\burllib\.request\b|\bHttpClient\b|\bRestTemplate\b|\bnet\/http\b|\bWebClient\b|\bopenai\.|\banthropic\./i,
  },
  {
    key: "events",
    label: "イベント発火・購読の変更",
    line: /\b(emit|publish|subscribe|dispatchEvent|addEventListener|removeEventListener)\s*\(|\b(kafka|rabbitmq|sns|sqs|pubsub|eventbridge|webhook)\b|@(EventHandler|EventListener|Subscribe)\b/i,
  },
  {
    key: "async-jobs",
    label: "非同期処理・ジョブの追加・変更",
    line: /\b(celery|sidekiq|resque|bullmq|agenda|cron|scheduler|BackgroundTasks|enqueue|Queue\s*\(|Worker\s*\()\b|@(task|shared_task|job|scheduled)\b|\bsetInterval\s*\(/i,
    path: /(^|\/)(jobs?|workers?|tasks?|queues?|cron)\//i,
  },
  {
    key: "auth",
    label: "認証・認可フローの変更",
    // Deliberately narrow. Bare words like `session`, `token`, `role` and `permission`
    // appear constantly in ordinary code (`--no-session-persistence`, `"role": "..."`,
    // `permissionMode`) and made this fire on changes that touch no auth flow at all.
    line: /\b(authenticate|authoriz(e|ation)|signIn|signOut|log(in|out)Handler|jwt|oauth2?|oidc|saml|csrf|rbac|access_token|refresh_token|id_token|bearer|hasPermission|checkPermission|requireAuth|isAuthori[sz]ed|current_user|login_required|passport\.|next-auth)\b/i,
    path: /(^|\/)(auth|authn|authz|oauth|session|permissions?|policies)(\/|\.[a-z0-9]+$)/i,
  },
];

/**
 * Added lines from a unified diff, excluding files whose prose would fire the patterns.
 * A design memo that says "OAuth" is not a change to the auth flow.
 */
export function addedCodeLines(diff) {
  const out = [];
  let skip = false;
  for (const line of String(diff ?? "").split("\n")) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) {
      skip = groupFor(header[2]) === "docs";
      continue;
    }
    if (!skip && line.startsWith("+") && !line.startsWith("+++")) out.push(line);
  }
  return out.join("\n");
}

/**
 * @param {string} diff  unified diff text
 * @param {string[]} paths changed file paths
 * @returns {{needed: boolean, reasons: string[]}}
 */
export function needsDiagram(diff, paths = []) {
  // Only added lines matter: removing a call does not need a new picture of the flow,
  // and context lines would fire on code the change never touched.
  const added = addedCodeLines(diff);
  const reasons = [];
  for (const t of TRIGGERS) {
    const byLine = t.line?.test(added);
    const byPath = t.path ? paths.some((p) => t.path.test(p)) : false;
    if (byLine || byPath) reasons.push(t.label);
  }
  return { needed: reasons.length > 0, reasons };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const base = args.find((a) => !a.startsWith("--")) || "development";
  const diff = execSync(`git diff ${base}...HEAD`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const paths = execSync(`git diff --name-only ${base}...HEAD`, { encoding: "utf8" }).split("\n").filter(Boolean);
  const r = needsDiagram(diff, paths);
  if (asJson) console.log(JSON.stringify(r));
  else console.log(r.needed ? `needed: ${r.reasons.join(", ")}` : "not needed");
  process.exit(0); // always 0: callers read the text, and a non-zero exit would abort an injected command
}
