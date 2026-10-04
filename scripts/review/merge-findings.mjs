#!/usr/bin/env node
// Merges the findings of the three verifiers into one ordered report.
// No model is involved: the ordering, the de-duplication and the tie-breaks are all
// fixed rules, so the same three inputs always produce the same report.
//
//   node scripts/review/merge-findings.mjs .harness/review/*.json [--json]
//
// Each input is a verifier's raw output. The last fenced ```json block is the
// payload; a file with no parsable payload is reported as "この観点は未実行".
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

const SEVERITIES = ["blocking", "shouldFix", "nit"];
const LABEL = { blocking: "Blocking（マージ不可）", shouldFix: "Should fix（マージ前に直すべき）", nit: "Nit（任意）" };
const PERSPECTIVES = ["spec", "test", "security"];

/** Pulls the last fenced ```json block out of a verifier's raw output. */
export function extractPayload(raw) {
  const text = String(raw ?? "");
  const fences = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const body of fences.reverse()) {
    try {
      const o = JSON.parse(body);
      if (o && typeof o === "object" && SEVERITIES.some((s) => Array.isArray(o[s]))) return o;
    } catch { /* try the fence before it */ }
  }
  try {
    const o = JSON.parse(text);
    if (o && typeof o === "object") return o;
  } catch { /* not JSON either */ }
  return null;
}

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * @param {Array<{name: string, payload: object|null}>} inputs
 * @returns {{findings: object[], counts: object, checked: string[], notChecked: string[], missing: string[]}}
 */
export function mergeFindings(inputs) {
  const byLocation = new Map(); // "file:line" -> entry
  const checked = [];
  const notChecked = [];
  const missing = [];

  for (const { name, payload } of inputs) {
    if (!payload) { missing.push(name); continue; }
    const perspective = norm(payload.perspective) || name;
    for (const severity of SEVERITIES) {
      for (const f of payload[severity] ?? []) {
        const file = norm(f.file) || "(unknown)";
        const line = Number.isFinite(Number(f.line)) ? Number(f.line) : 0;
        const key = `${file}:${line}`;
        const issue = norm(f.issue);
        const existing = byLocation.get(key);
        if (!existing) {
          byLocation.set(key, { file, line, severity, issues: [{ perspective, issue }] });
        } else {
          // Same place flagged twice: keep the strictest severity, list both notes.
          if (SEVERITIES.indexOf(severity) < SEVERITIES.indexOf(existing.severity)) existing.severity = severity;
          if (!existing.issues.some((i) => i.perspective === perspective && i.issue === issue)) {
            existing.issues.push({ perspective, issue });
          }
        }
      }
    }
    for (const c of payload.checked ?? []) checked.push(`[${perspective}] ${norm(c)}`);
    for (const c of payload.notChecked ?? []) notChecked.push(`[${perspective}] ${norm(c)}`);
  }

  const findings = [...byLocation.values()].sort(
    (a, b) =>
      SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
  for (const f of findings) f.issues.sort((a, b) => PERSPECTIVES.indexOf(a.perspective) - PERSPECTIVES.indexOf(b.perspective) || a.issue.localeCompare(b.issue));

  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));
  // Sorted, not input-ordered: whichever verifier happens to finish first must not
  // change the report.
  const byText = (a, b) => a.localeCompare(b);
  return { findings, counts, checked: checked.sort(byText), notChecked: notChecked.sort(byText), missing: missing.sort(byText) };
}

export function toMarkdown({ findings, counts, checked, notChecked, missing }) {
  const out = [];
  out.push(`Blocking **${counts.blocking}** / Should fix ${counts.shouldFix} / Nit ${counts.nit}`);
  if (missing.length) {
    out.push("", `> :warning: **${missing.join(", ")} は結果を返しませんでした。** この観点は未検証です。`);
  }
  for (const severity of SEVERITIES) {
    const group = findings.filter((f) => f.severity === severity);
    out.push("", `## ${LABEL[severity]}`);
    if (!group.length) { out.push("- なし"); continue; }
    for (const f of group) {
      const where = f.line ? `\`${f.file}:${f.line}\`` : `\`${f.file}\``;
      const notes = f.issues.map((i) => `${i.issue} _(${i.perspective})_`);
      out.push(`- ${where} — ${notes.join(" / ")}`);
    }
  }
  out.push("", "## 確認したこと");
  out.push(...(checked.length ? checked.map((c) => `- ${c}`) : ["- （報告なし）"]));
  out.push("", "## 確認できなかったこと");
  out.push(...(notChecked.length ? notChecked.map((c) => `- ${c}`) : ["- （報告なし）"]));
  return out.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const files = args.filter((a) => !a.startsWith("--"));
  if (!files.length) {
    console.error("usage: merge-findings.mjs <verifier-output>... [--json]");
    process.exit(2);
  }
  const inputs = files.map((f) => ({
    name: basename(f).replace(/\.[^.]+$/, ""),
    payload: existsSync(f) ? extractPayload(readFileSync(f, "utf8")) : null,
  }));
  const merged = mergeFindings(inputs);
  console.log(asJson ? JSON.stringify(merged, null, 2) : toMarkdown(merged));
  // Exit 1 when something blocks, so a caller can gate on it.
  process.exit(merged.counts.blocking > 0 ? 1 : 0);
}
