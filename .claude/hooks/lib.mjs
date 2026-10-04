// Shared helpers for the agent-harness hooks.
// Zero dependencies: only Node built-ins. Works on Linux and macOS.
//
// Hook protocol (verified against the Claude Code hooks reference, v2.1.245):
//   - input arrives as JSON on stdin
//   - exit 0  = proceed; stdout starting with "{" is parsed as JSON output
//   - exit 2  = block; stderr is shown to Claude as the reason
//   - PreToolUse may also return {hookSpecificOutput:{permissionDecision:"deny",...}}
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { spawnSync } from "node:child_process";

export const REQUIRED_FIELDS = [
  ["approvers[0]", (c) => Array.isArray(c.approvers) && c.approvers.length > 0 && c.approvers[0] !== ""],
  ["deploy.target", (c) => typeof c.deploy?.target === "string" && c.deploy.target !== ""],
  ["deploy.productionBranch", (c) => typeof c.deploy?.productionBranch === "string" && c.deploy.productionBranch !== ""],
  ["commands.test", (c) => typeof c.commands?.test === "string" && c.commands.test !== ""],
  ["budget.maxParallel", (c) => Number.isInteger(c.budget?.maxParallel)],
  ["budget.maxDepth", (c) => Number.isInteger(c.budget?.maxDepth)],
  ["budget.bestOfN", (c) => Number.isInteger(c.budget?.bestOfN)],
  ...["planner", "implementer", "explorer", "verifier"].map((role) => [
    `agents.${role}.model`,
    (c) => typeof c.agents?.[role]?.model === "string" && c.agents[role].model !== "",
  ]),
];

export function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

export function readStdinJson() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    return { __parseError: String(err) };
  }
}

/**
 * Loads .claude/harness.config.json. Falls back to the example file so policy
 * values (protectedPaths etc.) are never duplicated in code.
 * Returns { config, source: "config" | "example" | "none", path }.
 */
export function loadConfig(dir = projectDir()) {
  const override = process.env.HARNESS_CONFIG;
  const candidates = override
    ? [[override, "config"]]
    : [
        [resolve(dir, ".claude/harness.config.json"), "config"],
        [resolve(dir, ".claude/harness.config.example.json"), "example"],
      ];
  for (const [path, source] of candidates) {
    if (existsSync(path)) {
      try {
        return { config: JSON.parse(readFileSync(path, "utf8")), source, path };
      } catch (err) {
        return { config: null, source: "none", path, error: String(err) };
      }
    }
  }
  return { config: null, source: "none", path: candidates[0][0] };
}

export function missingRequired(config) {
  if (!config) return REQUIRED_FIELDS.map(([name]) => name);
  return REQUIRED_FIELDS.filter(([, ok]) => !ok(config)).map(([name]) => name);
}

/** gitignore-like glob -> RegExp. A pattern without "/" matches at any depth. */
export function globToRegExp(glob) {
  const g = glob.replace(/^\.\//, "");
  const anyDepth = !g.includes("/");
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === "*") {
      if (g[i + 1] === "*") {
        // "**/" matches zero or more directories; trailing "**" matches everything
        if (g[i + 2] === "/") { re += "(?:.*/)?"; i += 2; }
        else { re += ".*"; i += 1; }
      } else re += "[^/]*";
    } else if (ch === "?") re += "[^/]";
    else if (".+^${}()|[]\\".includes(ch)) re += "\\" + ch;
    else re += ch;
  }
  const prefix = anyDepth ? "(?:^|/)" : "^";
  return new RegExp(`${prefix}${re}(?:/.*)?$`);
}

export function matchesAny(path, globs) {
  return globs.find((g) => globToRegExp(g).test(path)) ?? null;
}

/** Path as seen from the project root, with "~" expanded, "/" separators. */
export function normalizePath(p, dir = projectDir()) {
  if (!p) return "";
  let x = p.replace(/^["']|["']$/g, "");
  if (x.startsWith("~/")) x = resolve(process.env.HOME || "", x.slice(2));
  const abs = isAbsolute(x) ? x : resolve(dir, x);
  let rel = relative(dir, abs).split(sep).join("/");
  if (rel.startsWith("../")) rel = abs; // outside the project: keep absolute for matching
  return rel;
}

/** Tokens of a shell command that look like file paths (best effort, deliberately broad). */
export function pathLikeTokens(command) {
  const tokens = command.split(/\s+|[;&|()<>]+/).filter(Boolean);
  return tokens
    .map((t) => t.replace(/^["']|["']$/g, ""))
    .filter((t) => t && !t.startsWith("-") && (t.includes("/") || t.startsWith(".") || /\.[a-z0-9]+$/i.test(t)));
}

const ESCALATE =
  "\n\nこの操作はポリシー上 Claude Code が自動で行えません（Tier 3）。代わりに、なぜ必要かを説明して人（承認者）に確認してください。承認者は .claude/harness.config.json の approvers にあります。";

export function deny(reason, extra = {}) {
  const msg = reason + ESCALATE;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: msg,
        ...extra,
      },
    }) + "\n",
  );
  process.stderr.write(msg + "\n");
  process.exit(2);
}

export function block(reason) {
  process.stderr.write(reason + "\n");
  process.exit(2);
}

export function context(text, hookEventName) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: text } }) + "\n");
}

export function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/** Runs a configured command. "{file}" is substituted if present. */
export function runCommand(template, { file, cwd } = {}) {
  let cmd = template;
  if (file !== undefined && cmd.includes("{file}")) cmd = cmd.replaceAll("{file}", shellQuote(file));
  const res = spawnSync("bash", ["-lc", cmd], { cwd: cwd || projectDir(), encoding: "utf8", env: process.env });
  return { cmd, status: res.status ?? 1, stdout: res.stdout || "", stderr: res.stderr || "" };
}
