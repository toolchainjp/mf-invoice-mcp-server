#!/usr/bin/env node
// SubagentStop: releases the parallel slot the PreToolUse hook reserved, and checks
// that the explorer really summarised instead of pasting files back.
import { readStdinJson, block } from "./lib.mjs";
import { readSubagents, writeSubagents, withLock, recordBlocked } from "./state.mjs";
import { checkExplorerOutput } from "./agents.mjs";

const input = readStdinJson();
const agentId = input.agent_id;
const agentType = input.agent_type;

withLock(() => {
  const state = readSubagents();
  const i = (state.slots ?? []).findIndex((s) => (agentId && s.bound === agentId) || (!agentId && s.agent === agentType));
  if (i >= 0) state.slots.splice(i, 1);
  else {
    const j = (state.slots ?? []).findIndex((s) => s.agent === agentType);
    if (j >= 0) state.slots.splice(j, 1);
  }
  if (agentId && state.agents) delete state.agents[agentId];
  writeSubagents(state);
});

// The explorer exists to keep large file contents out of the caller's context.
// Blocking here sends it back to summarise rather than letting the dump through.
if (agentType === "explorer" && input.stop_hook_active !== true) {
  const reason = checkExplorerOutput(input.last_assistant_message);
  if (reason) {
    recordBlocked("explorer.output", reason);
    block(`[harness] ${reason}`);
  }
}
process.exit(0);
