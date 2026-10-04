// Which config role each harness subagent draws its model tier from, and the
// checks the PreToolUse hook runs before an Agent call is allowed.
//
// The subagent definitions in .claude/agents/ deliberately omit `model`, so
// harness.config.json is the only place a tier is chosen. The caller passes it as
// the Agent tool's `model` parameter and this module rejects a mismatch, which is
// what stops a run from quietly promoting itself to a more expensive model.

/** Harness-managed subagent name -> role key in config.agents. */
export const ROLE_OF = {
  planner: "planner",
  implementer: "implementer",
  explorer: "explorer",
  "verifier-spec": "verifier",
  "verifier-test": "verifier",
  "verifier-security": "verifier",
  reviewer: "verifier", // deprecated, kept until the 3 verifiers are proven in CI
};

export function modelForRole(config, role) {
  return config?.agents?.[role]?.model ?? "";
}

/** Model tier for a subagent name, or "" when the name is not harness-managed. */
export function modelForAgent(config, agentName) {
  const role = ROLE_OF[agentName];
  return role ? modelForRole(config, role) : "";
}

/**
 * Decides whether one Agent call may proceed.
 * Pure apart from `now`, so the tests drive it directly.
 *
 * @param {object} a
 * @param {object} a.state    parsed .harness/state/subagents.json (already pruned)
 * @param {object} a.config   harness.config.json
 * @param {string} a.agentName tool_input.subagent_type
 * @param {string} [a.model]  tool_input.model
 * @param {string} [a.callerAgentId] hook input agent_id; absent in the main conversation
 * @returns {{ok: true, depth: number} | {ok: false, kind: string, reason: string}}
 */
export function checkAgentCall({ state, config, agentName, model, callerAgentId }) {
  const maxParallel = config?.budget?.maxParallel;
  const maxDepth = config?.budget?.maxDepth;
  if (!Number.isInteger(maxParallel) || !Number.isInteger(maxDepth)) {
    return { ok: false, kind: "config", reason: "budget.maxParallel と budget.maxDepth が設定されていません。" };
  }

  // Depth: the caller's own depth + 1. A caller we have no record of is assumed to be
  // one level deep, which is the conservative reading.
  const callerDepth = callerAgentId ? (state.agents?.[callerAgentId]?.depth ?? 1) : 0;
  const depth = callerDepth + 1;
  if (depth > maxDepth) {
    return {
      ok: false,
      kind: "budget.maxDepth",
      reason: `subagent の入れ子が深さ ${depth} になります（上限 ${maxDepth}）。呼び出し元自身が調査・実装を行うか、主コンテキストから呼び直してください。`,
    };
  }

  const running = state.slots?.length ?? 0;
  if (running >= maxParallel) {
    return {
      ok: false,
      kind: "budget.maxParallel",
      reason: `同時に走る subagent が上限 ${maxParallel} に達しています（実行中 ${running}）。先に走っているものが終わってから呼んでください。`,
    };
  }

  const expected = modelForAgent(config, agentName);
  if (expected && model !== expected) {
    return {
      ok: false,
      kind: "agents.model",
      reason:
        `${agentName} のモデルは harness.config.json で "${expected}" と決まっています（指定: ${model ? `"${model}"` : "未指定"}）。` +
        `Agent の model パラメータに "${expected}" を渡してください。変更したい場合は設定を PR で変えます。`,
    };
  }
  return { ok: true, depth };
}

/**
 * Explorer output guard: the point of the explorer is to protect the caller's context,
 * so an answer that pastes files back defeats it.
 * @returns {string|null} reason to reject, or null when acceptable
 */
export function checkExplorerOutput(text, { maxLines = 60, maxQuoteRun = 12 } = {}) {
  const lines = String(text ?? "").split("\n");
  if (lines.length > maxLines) {
    return `explorer の出力が ${lines.length} 行あります（上限 ${maxLines} 行）。要約の粒度を上げ、根拠は パス:行 だけにしてください。`;
  }
  let run = 0;
  let inFence = false;
  for (const l of lines) {
    if (/^\s*```/.test(l)) { inFence = !inFence; run = 0; continue; }
    run = inFence || /^\s{4,}\S/.test(l) ? run + 1 : 0;
    if (run > maxQuoteRun) {
      return `explorer の出力にファイル本文の貼り付けらしき ${run} 行の塊があります（引用は 1 か所 3 行まで）。要約してください。`;
    }
  }
  return null;
}
