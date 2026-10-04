#!/usr/bin/env bash
# promptfoo exec provider: runs the prompt through Claude Code in this repository.
# Argument 1 is the prompt. Output on stdout is the model's final text.
# Tool use is read-only here: cases test judgement and reporting, not code changes.
set -euo pipefail
cd "$(dirname "$0")/../.."
prompt="$1"
mkdir -p evals/output
claude -p "$prompt" \
  --output-format text \
  --max-turns "${EVAL_MAX_TURNS:-6}" \
  --permission-mode dontAsk \
  --disallowedTools "Edit,Write,NotebookEdit,WebFetch,WebSearch" \
  --no-session-persistence 2>>evals/output/claude-stderr.log
