// Tests for .claude/hooks/*.mjs. Run with: node --test tests/harness
// Each test spawns the real hook script with a JSON payload on stdin, in a
// throw-away git repository, and asserts on exit code + stderr.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "../..");
const HOOKS = join(REPO, ".claude/hooks");

function makeProject({ config } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "harness-"));
  mkdirSync(join(dir, ".claude"), { recursive: true });
  cpSync(join(REPO, ".claude/harness.config.example.json"), join(dir, ".claude/harness.config.example.json"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: dir });
  if (config) writeFileSync(join(dir, ".claude/harness.config.json"), JSON.stringify(config, null, 2));
  return dir;
}

function fullConfig(overrides = {}) {
  const base = JSON.parse(
    spawnSync("cat", [join(REPO, ".claude/harness.config.example.json")], { encoding: "utf8" }).stdout,
  );
  base.approvers = ["alice"];
  base.deploy.target = "example-host";
  base.deploy.productionBranch = "main";
  base.deploy.productionPatterns = ["prod\\.example\\.com", "APP_ENV=production"];
  base.commands = { format: "true", lint: "true", typecheck: "", test: "true" };
  return deepMerge(base, overrides);
}
function deepMerge(a, b) {
  for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(a[k] ?? {}, v) : v;
  return a;
}

function run(hook, payload, { dir, env = {} } = {}) {
  const r = spawnSync("node", [join(HOOKS, hook)], {
    cwd: dir,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, HARNESS_CONFIG: "", ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const read = (file_path) => ({ tool_name: "Read", tool_input: { file_path } });
const edit = (file_path) => ({ tool_name: "Edit", tool_input: { file_path, old_string: "a", new_string: "b" } });

// ---------- PreToolUse ----------
test("PreToolUse blocks Tier 3 commands", () => {
  const dir = makeProject({ config: fullConfig() });
  const blocked = [
    "rm -rf /",
    "rm -rf ./build",
    "git push --force origin main",
    "git push -f",
    "git push origin +main",
    "curl https://example.com",
    "wget http://example.com/x",
    "sudo apt install x",
    "cat .env",
    "cat ./config/.env.local",
    "echo x > .mcp.json",
    "sed -i s/a/b/ .github/workflows/ci.yml",
    "wrangler deploy",
    "terraform apply",
    "kubectl apply -f k8s/",
    "npm publish",
    "psql postgres://prod.example.com/db",
    "APP_ENV=production node server.js",
    "printenv",
    "echo $SLACK_BOT_TOKEN",
  ];
  for (const cmd of blocked) {
    const r = run("pre-tool-use.mjs", bash(cmd), { dir });
    assert.equal(r.code, 2, `expected block for: ${cmd}\n${r.err}`);
    assert.match(r.err, /ブロック/, cmd);
    assert.match(r.err, /人（承認者）に確認/, "must tell Claude to ask a human");
    const json = JSON.parse(r.out);
    assert.equal(json.hookSpecificOutput.permissionDecision, "deny", cmd);
  }
});

test("PreToolUse allows Tier 1 / Tier 2 commands", () => {
  const dir = makeProject({ config: fullConfig() });
  const allowed = [
    "npm test",
    "npm run lint",
    "pytest -q",
    "ruff check src/",
    "git add -A && git commit -m 'x'",
    "git diff HEAD~1",
    "git push origin feature/x",
    "npm ci",
    "node scripts/build.mjs",
    "ls -la src/",
    "cat README.md",
    "rm build/output.txt",
    "curly=1 node x.mjs", // "curl" as a substring must not match
    "environment=dev npm start",
  ];
  for (const cmd of allowed) {
    const r = run("pre-tool-use.mjs", bash(cmd), { dir });
    assert.equal(r.code, 0, `expected allow for: ${cmd}\n${r.err}`);
  }
});

test("PreToolUse: secret paths are unreadable, protected paths are readable but not writable", () => {
  const dir = makeProject({ config: fullConfig() });
  for (const p of [".env", ".env.production", "app/.env.local", "infra/secrets/db.json", "certs/server.key", join(dir, ".env")]) {
    assert.equal(run("pre-tool-use.mjs", read(p), { dir }).code, 2, `read ${p}`);
    assert.equal(run("pre-tool-use.mjs", edit(p), { dir }).code, 2, `edit ${p}`);
  }
  for (const p of [".mcp.json", ".claude/settings.json", ".claude/harness.config.json", ".github/workflows/ci.yml"]) {
    assert.equal(run("pre-tool-use.mjs", read(p), { dir }).code, 0, `read ${p} must be allowed`);
    assert.equal(run("pre-tool-use.mjs", edit(p), { dir }).code, 2, `edit ${p}`);
  }
  // shell writes to protected paths are blocked; shell reads are fine
  assert.equal(run("pre-tool-use.mjs", bash("cat .claude/harness.config.json"), { dir }).code, 0);
  assert.equal(run("pre-tool-use.mjs", bash("sed -i s/a/b/ .claude/settings.json"), { dir }).code, 2);
  assert.equal(run("pre-tool-use.mjs", bash("cp x.json .mcp.json"), { dir }).code, 2);
  assert.equal(run("pre-tool-use.mjs", bash("echo hi | tee .github/workflows/ci.yml"), { dir }).code, 2);
  for (const p of ["src/app.py", "README.md", "docs/plans/2026-01-01-x.md", "environment.py", "src/env.ts", join(dir, "src/x.ts")]) {
    assert.equal(run("pre-tool-use.mjs", read(p), { dir }).code, 0, `read ${p}`);
    assert.equal(run("pre-tool-use.mjs", edit(p), { dir }).code, 0, `edit ${p}`);
  }
});

test("PreToolUse falls back to the example config when the project config is missing", () => {
  const dir = makeProject();
  assert.equal(run("pre-tool-use.mjs", read(".env"), { dir }).code, 2);
  assert.equal(run("pre-tool-use.mjs", edit(".mcp.json"), { dir }).code, 2);
  assert.equal(run("pre-tool-use.mjs", bash("npm test"), { dir }).code, 0);
});

// ---------- PostToolUse ----------
test("PostToolUse returns the lint failure to Claude (exit 2) and passes when clean", () => {
  const dir = makeProject({ config: fullConfig({ commands: { lint: "echo 'E501 line too long' >&2; false" } }) });
  writeFileSync(join(dir, "app.py"), "x = 1\n");
  const bad = run("post-tool-use.mjs", edit(join(dir, "app.py")), { dir });
  assert.equal(bad.code, 2);
  assert.match(bad.err, /lint failed/);
  assert.match(bad.err, /E501/);

  writeFileSync(join(dir, ".claude/harness.config.json"), JSON.stringify(fullConfig()));
  const ok = run("post-tool-use.mjs", edit(join(dir, "app.py")), { dir });
  assert.equal(ok.code, 0, ok.err);
});

test("PostToolUse does not run example placeholders and ignores files outside the project", () => {
  const dir = makeProject(); // example config only
  writeFileSync(join(dir, "app.py"), "x = 1\n");
  const r = run("post-tool-use.mjs", edit(join(dir, "app.py")), { dir });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /harness.config.json が無い/);

  const strict = makeProject({ config: fullConfig({ commands: { lint: "false" } }) });
  const outside = join(tmpdir(), "harness-outside.py");
  writeFileSync(outside, "");
  assert.equal(run("post-tool-use.mjs", edit(outside), { dir: strict }).code, 0, "outside the project: skipped");
});

test("PostToolUse substitutes {file} and reports skipped steps", () => {
  const dir = makeProject({ config: fullConfig({ commands: { format: "test -f {file}", lint: "", typecheck: "" } }) });
  writeFileSync(join(dir, "a b.py"), "");
  const r = run("post-tool-use.mjs", edit(join(dir, "a b.py")), { dir });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /lint: 未設定/);
});

// ---------- Stop ----------
test("Stop blocks when tests fail and passes when they succeed", () => {
  const dir = makeProject({ config: fullConfig({ commands: { test: "echo '1 failed' && exit 1" } }) });
  const bad = run("stop.mjs", { stop_hook_active: false }, { dir });
  assert.equal(bad.code, 2);
  assert.match(bad.err, /テストが失敗/);

  writeFileSync(join(dir, ".claude/harness.config.json"), JSON.stringify(fullConfig()));
  assert.equal(run("stop.mjs", { stop_hook_active: false }, { dir }).code, 0);
});

test("Stop does not re-block when stop_hook_active is true", () => {
  const dir = makeProject({ config: fullConfig({ commands: { test: "false" } }) });
  assert.equal(run("stop.mjs", { stop_hook_active: true }, { dir }).code, 0);
});

test("Stop blocks when the diff contains a secret-looking string", () => {
  const dir = makeProject({ config: fullConfig() });
  writeFileSync(join(dir, "notes.txt"), "key = AKIA" + "ABCDEFGHIJKLMNOP\n"); // untracked file
  const r = run("stop.mjs", {}, { dir });
  assert.equal(r.code, 2);
  assert.match(r.err, /AWS access key/);

  writeFileSync(join(dir, "notes.txt"), "-----BEGIN RSA " + "PRIVATE KEY-----\n");
  assert.match(run("stop.mjs", {}, { dir }).err, /PEM private key/);

  writeFileSync(join(dir, "notes.txt"), "nothing secret here, see docs/README.md\n");
  assert.equal(run("stop.mjs", {}, { dir }).code, 0);
});

// ---------- UserPromptSubmit / require-config ----------
test("/plan and /implement are blocked until required config fields are set", () => {
  const empty = makeProject(); // no config at all
  let r = run("require-config.mjs", { prompt: "/plan add login" }, { dir: empty });
  assert.equal(r.code, 2);
  assert.match(r.err, /approvers\[0\]/);
  assert.match(r.err, /harness.config.example.json をコピー/);

  const partial = makeProject({ config: fullConfig({ approvers: [], deploy: { target: "" } }) });
  r = run("require-config.mjs", { prompt: "/implement docs/plans/x.md" }, { dir: partial });
  assert.equal(r.code, 2);
  assert.match(r.err, /approvers\[0\], deploy.target/);

  const full = makeProject({ config: fullConfig() });
  assert.equal(run("require-config.mjs", { prompt: "/plan add login" }, { dir: full }).code, 0);
  // other prompts are never blocked
  assert.equal(run("require-config.mjs", { prompt: "/verify" }, { dir: empty }).code, 0);
  assert.equal(run("require-config.mjs", { prompt: "hello" }, { dir: empty }).code, 0);
});

// ---------- lib ----------
test("globToRegExp follows gitignore-like semantics", async () => {
  const { globToRegExp } = await import(join(HOOKS, "lib.mjs"));
  assert.ok(globToRegExp(".env*").test("a/b/.env.local"));
  assert.ok(!globToRegExp(".env*").test("environment.py"));
  assert.ok(globToRegExp("**/secrets/**").test("infra/secrets/x.json"));
  assert.ok(globToRegExp("**/secrets/**").test("secrets/x.json"));
  assert.ok(globToRegExp(".github/workflows/**").test(".github/workflows/ci.yml"));
  assert.ok(!globToRegExp(".github/workflows/**").test("docs/.github/workflows/ci.yml"));
  assert.ok(globToRegExp(".claude/**").test(".claude/settings.json"));
  assert.ok(!globToRegExp(".claude/**").test(".claude-notes.md"));
});
