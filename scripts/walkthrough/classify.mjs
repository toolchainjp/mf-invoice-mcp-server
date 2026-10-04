#!/usr/bin/env node
// Groups changed files so a reviewer can read a pull request in a sensible order
// instead of scrolling a flat list. Pure path rules, no model involved: the same
// diff always produces the same grouping.

/** Reading order. A group missing from the diff is simply omitted. */
export const GROUPS = [
  { key: "schema", label: "スキーマ・データ定義", why: "他のすべてが依存するので最初に読む" },
  { key: "types", label: "型・インターフェース", why: "呼び出し側の前提が決まる" },
  { key: "logic", label: "ロジック", why: "変更の中心" },
  { key: "callers", label: "呼び出し元", why: "ロジックの変更がどこから使われるか" },
  { key: "ui", label: "UI", why: "利用者から見える変化" },
  { key: "tests", label: "テスト", why: "何を保証しているか" },
  { key: "config", label: "設定・CI", why: "動作環境と自動化の変更" },
  { key: "docs", label: "ドキュメント", why: "最後に読めばよい" },
  { key: "other", label: "その他", why: "上のどれにも当てはまらないもの" },
];

// Ordered: the first match wins, so narrower rules come first. A test file under
// src/ is a test, not logic; a .tsx file is UI, not logic.
const RULES = [
  ["tests", /(^|\/)(tests?|__tests__|spec|e2e)\//i],
  ["tests", /(^|\/)conftest\.py$|(\.|_)(test|spec)\.[a-z0-9]+$|_test\.[a-z0-9]+$|(^|\/)test_[^/]+\.py$/i],
  ["schema", /(^|\/)(migrations?|migrate|db\/migrate|alembic)\//i],
  ["schema", /\.(sql|prisma|graphql|gql|proto|avsc)$/i],
  ["schema", /(^|\/)(schema|models?|entities)\.[a-z0-9]+$|(^|\/)(schema|models|entities)\//i],
  ["schema", /(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$/i],
  ["types", /\.d\.ts$/i],
  ["types", /(^|\/)(types?|interfaces?|dto|protocols?)(\/|\.[a-z0-9]+$)/i],
  ["ui", /\.(tsx|jsx|vue|svelte|css|scss|sass|less|html)$/i],
  ["ui", /(^|\/)(components?|pages?|views?|screens?|layouts?|templates?|styles?|assets?|public|static)\//i],
  // Agent definitions, prompts and harness settings are configuration, not prose or
  // call sites — this rule has to come before the generic `commands/` one below.
  ["config", /(^|\/)\.claude\//i],
  ["callers", /(^|\/)(routes?|api|endpoints?|handlers?|controllers?|resolvers?|cli|commands?|urls?)(\/|\.[a-z0-9]+$)/i],
  ["config", /(^|\/)\.github\//i],
  ["config", /(^|\/)(Dockerfile|Makefile|Procfile)(\.|$)/i],
  ["config", /\.(ya?ml|toml|ini|cfg|conf|env\.example|editorconfig)$/i],
  ["config", /(^|\/)(package(-lock)?\.json|tsconfig[^/]*\.json|pyproject\.toml|requirements[^/]*\.txt|.*\.lock)$/i],
  ["config", /(^|\/)\.[a-z0-9_-]+rc(\.[a-z0-9]+)?$/i],
  ["config", /(^|\/)\.gitignore$|\.example$/i],
  ["config", /\.json$/i], // after the schema rules, so openapi.json is still schema
  ["docs", /\.(md|mdx|rst|adoc|txt)$/i],
  ["docs", /(^|\/)docs?\//i],
  ["logic", /(^|\/)(src|lib|app|internal|pkg|services?|domain|core|scripts?|hooks?|utils?)\//i],
  ["logic", /\.(ts|js|mjs|cjs|py|go|rb|rs|java|kt|php|cs|swift|sh)$/i],
];

export function groupFor(path) {
  for (const [key, re] of RULES) if (re.test(path)) return key;
  return "other";
}

/**
 * @param {Array<{path: string, added: number, removed: number}>} files
 * @returns {Array<{key,label,why,files,added,removed}>} in reading order, empty groups dropped
 */
export function classify(files) {
  const byKey = new Map(GROUPS.map((g) => [g.key, { ...g, files: [], added: 0, removed: 0 }]));
  for (const f of files) {
    const g = byKey.get(groupFor(f.path));
    g.files.push(f);
    g.added += f.added;
    g.removed += f.removed;
  }
  for (const g of byKey.values()) g.files.sort((a, b) => a.path.localeCompare(b.path));
  return GROUPS.map((g) => byKey.get(g.key)).filter((g) => g.files.length > 0);
}

/** Parses `git diff --numstat` output. Binary files report "-" and count as 0 lines. */
export function parseNumstat(text) {
  return String(text ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [added, removed, ...rest] = line.split("\t");
      // Renames arrive as "old => new"; the new path is what a reviewer opens.
      const raw = rest.join("\t");
      const path = raw.includes(" => ") ? raw.replace(/^.*\{?.*? => (.*?)\}?$/, "$1").replace(/\/\//g, "/") : raw;
      return { path, added: Number(added) || 0, removed: Number(removed) || 0 };
    })
    .filter((f) => f.path);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { execSync } = await import("node:child_process");
  const base = process.argv[2] || "development";
  const out = execSync(`git diff --numstat ${base}...HEAD`, { encoding: "utf8" });
  console.log(JSON.stringify(classify(parseNumstat(out)), null, 2));
}
