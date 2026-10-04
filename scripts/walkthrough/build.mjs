#!/usr/bin/env node
// Builds the walkthrough block that goes at the top of a pull request body.
// Everything here is derived from the diff by fixed rules — no model is involved — so
// the block is stable across re-runs and cannot invent a description of the change.
//
//   node scripts/walkthrough/build.mjs --base development [--plan docs/plans/x.md]
//       [--pr-body-file body.md] [--diagram-file diagram.mmd] [--diagram-reasons "..."]
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { classify, parseNumstat } from "./classify.mjs";

export const START = "<!-- harness:walkthrough:start -->";
export const END = "<!-- harness:walkthrough:end -->";

/** Counts the bullets under the "確認できなかったこと" heading of a verification report. */
export function countUnverified(prBody) {
  const lines = String(prBody ?? "").split("\n");
  const start = lines.findIndex((l) => /^#{1,4}\s*.*確認できなかったこと/.test(l));
  if (start < 0) return null; // no verification report in the body yet
  let n = 0;
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,4}\s/.test(line)) break;
    if (/^\s*[-*]\s+\S/.test(line) && !/（報告なし）|^\s*[-*]\s*なし\s*$/.test(line)) n++;
  }
  return n;
}

/** Finds a design memo path mentioned in the PR body. */
export function findPlanPath(prBody) {
  const m = String(prBody ?? "").match(/docs\/plans\/[A-Za-z0-9._-]+\.md/);
  return m ? m[0] : null;
}

export function buildWalkthrough({ files, planPath, unverified, diagram, diagramReasons, repo, sha }) {
  const groups = classify(files);
  const totalAdded = files.reduce((s, f) => s + f.added, 0);
  const totalRemoved = files.reduce((s, f) => s + f.removed, 0);
  const link = (p) => (repo && sha ? `[\`${p}\`](https://github.com/${repo}/blob/${sha}/${p})` : `\`${p}\``);

  const out = [START, "", "## 📋 ウォークスルー（自動生成）", ""];
  out.push(`変更 **${files.length} ファイル**（+${totalAdded} / −${totalRemoved}）を、依存の順に並べています。上から読むと前提が先に分かります。`, "");

  if (!files.length) {
    out.push("_差分がありません。_", "", END);
    return out.join("\n");
  }

  out.push("| # | グループ | ファイル | 増減 | なぜこの順か |", "| --- | --- | --- | --- | --- |");
  groups.forEach((g, i) => {
    out.push(`| ${i + 1} | **${g.label}** | ${g.files.length} | +${g.added} / −${g.removed} | ${g.why} |`);
  });
  out.push("");

  out.push("<details><summary>グループごとのファイル一覧</summary>", "");
  for (const g of groups) {
    out.push(`**${g.label}**`, "");
    for (const f of g.files) out.push(`- ${link(f.path)} (+${f.added} / −${f.removed})`);
    out.push("");
  }
  out.push("</details>", "");

  const refs = [];
  refs.push(planPath ? `- 設計メモ: ${link(planPath)}` : "- 設計メモ: **PR 本文にリンクがありません**（`docs/plans/…` を書いてください）");
  refs.push(
    unverified === null
      ? "- 検証報告: **PR 本文にありません**（CLAUDE.md §4 の形式で書いてください）"
      : unverified > 0
        ? `- 検証報告の「確認できなかったこと」: **${unverified} 件** — マージ前に読んでください`
        : "- 検証報告の「確認できなかったこと」: 0 件",
  );
  out.push(...refs, "");

  if (diagram) {
    out.push(
      "### 相互作用の変化（自動生成・要確認）",
      "",
      `> :warning: **自動生成・要確認**: この図はモデルが差分から起こしたもので、実装との一致は保証されません。` +
        `食い違いを見つけたら Should fix として扱ってください（生成条件: ${diagramReasons || "不明"}）。`,
      "",
      "```mermaid",
      diagram.trim(),
      "```",
      "",
    );
  }

  out.push(END);
  return out.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (name, fallback = null) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const base = opt("base", "development");
  const prBody = existsSync(opt("pr-body-file", "")) ? readFileSync(opt("pr-body-file"), "utf8") : "";
  const diagramFile = opt("diagram-file", "");
  const files = parseNumstat(execSync(`git diff --numstat ${base}...HEAD`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));

  console.log(
    buildWalkthrough({
      files,
      planPath: opt("plan") || findPlanPath(prBody),
      unverified: countUnverified(prBody),
      diagram: diagramFile && existsSync(diagramFile) ? readFileSync(diagramFile, "utf8") : null,
      diagramReasons: opt("diagram-reasons", ""),
      repo: opt("repo") || process.env.GITHUB_REPOSITORY || "",
      sha: opt("sha") || execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
    }),
  );
}
