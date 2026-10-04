#!/usr/bin/env bash
# Runs the eval suite. Works locally and in CI. Extra args are passed to promptfoo eval.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p evals/output
: > evals/output/judge-log.jsonl
command -v claude >/dev/null || { echo "claude CLI not found (npm install -g @anthropic-ai/claude-code)"; exit 1; }
# Pinned so CI results are reproducible. Bump deliberately.
PROMPTFOO_VERSION="${PROMPTFOO_VERSION:-0.122.0}"
export PROMPTFOO_DISABLE_TELEMETRY=1
npx --yes "promptfoo@${PROMPTFOO_VERSION}" eval -c evals/promptfooconfig.yaml --no-cache --output evals/output/results.json "$@"
