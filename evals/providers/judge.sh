#!/usr/bin/env bash
# promptfoo grading provider for `llm-rubric`. promptfoo passes a grading prompt
# that embeds the rubric and the output under test; we answer with strict JSON
# {"pass": bool, "score": 0..1, "reason": "..."} and log every verdict so a human
# can audit the judge (evals/output/judge-log.jsonl).
set -euo pipefail
cd "$(dirname "$0")/../.."
grading_prompt="$1"
schema='{"type":"object","required":["pass","score","reason"],"properties":{"pass":{"type":"boolean"},"score":{"type":"number"},"reason":{"type":"string"}}}'
raw=$(claude -p "$grading_prompt

Answer ONLY with JSON matching {\"pass\": boolean, \"score\": number 0-1, \"reason\": string}. Be strict: a missing required element is a fail." \
  --output-format json --json-schema "$schema" --max-turns 1 --no-session-persistence 2>/dev/null || true)
verdict=$(printf '%s' "$raw" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    let v = { pass: false, score: 0, reason: "judge produced no output" };
    try { const j = JSON.parse(s); v = j.structured_output || JSON.parse(j.result); } catch {}
    process.stdout.write(JSON.stringify(v));
  });')
mkdir -p evals/output
printf '{"ts":"%s","prompt":%s,"verdict":%s}\n' "$(date -u +%FT%TZ)" "$(printf '%s' "$grading_prompt" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify(s)))')" "$verdict" >> evals/output/judge-log.jsonl
printf '%s' "$verdict"
