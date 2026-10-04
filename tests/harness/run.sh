#!/usr/bin/env bash
# Runs every harness test (hooks + notify). Zero dependencies beyond Node >= 20.
# Used by: CI (ci.yml), the Stop hook of this template repository, and /verify.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "== syntax check: hooks, scripts =="
for f in .claude/hooks/*.mjs scripts/notify/*.mjs; do
  [ -f "$f" ] && node --check "$f"
done

echo "== JSON validity: settings, config schema, example, .mcp.json =="
node -e '
  const fs = require("fs");
  for (const f of [".claude/settings.json", ".claude/harness.config.schema.json", ".claude/harness.config.example.json", ".mcp.json"]) {
    if (fs.existsSync(f)) JSON.parse(fs.readFileSync(f, "utf8"));
  }'

echo "== node --test tests/harness =="
node --test "tests/harness/**/*.test.mjs"
