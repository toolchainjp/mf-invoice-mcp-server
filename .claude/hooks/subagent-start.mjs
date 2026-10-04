#!/usr/bin/env node
// SubagentStart: records agent_id -> depth so a nested Agent call can be measured.
// This event cannot block (exit 2 only prints); the blocking check lives in
// PreToolUse. All this hook does is bookkeeping.
import { readStdinJson } from "./lib.mjs";
import { readSubagents, writeSubagents, withLock } from "./state.mjs";

const input = readStdinJson();
const agentId = input.agent_id;
const agentType = input.agent_type;
if (!agentId) process.exit(0);

withLock(() => {
  const state = readSubagents();
  // Match the slot PreToolUse reserved for this agent name (oldest first).
  const slot = (state.slots ?? []).find((s) => s.agent === agentType && !s.bound);
  if (slot) slot.bound = agentId;
  state.agents = state.agents ?? {};
  state.agents[agentId] = { agent: agentType, depth: slot?.depth ?? 1, at: Date.now() };
  writeSubagents(state);
});
process.exit(0);
