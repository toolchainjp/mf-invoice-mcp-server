#!/usr/bin/env node
// Prints the model tier a harness subagent must be called with.
//
//   node scripts/agents/model-for.mjs verifier-spec   -> haiku
//
// Slash commands embed this with `!`...`` so the tier is read from
// harness.config.json at call time. The subagent definitions in .claude/agents/
// omit `model` on purpose: this file and the config are the only source, and the
// PreToolUse hook rejects an Agent call whose `model` does not match.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ROLE_OF = {
  planner: "planner",
  implementer: "implementer",
  explorer: "explorer",
  "verifier-spec": "verifier",
  "verifier-test": "verifier",
  "verifier-security": "verifier",
  reviewer: "verifier",
};

const name = process.argv[2];
if (!name) {
  console.error("usage: model-for.mjs <agent-name|role>");
  process.exit(2);
}
const configPath =
  process.env.HARNESS_CONFIG ||
  [resolve(REPO, ".claude/harness.config.json"), resolve(REPO, ".claude/harness.config.example.json")].find(existsSync);
if (!configPath || !existsSync(configPath)) {
  console.error("harness.config.json not found");
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));
const role = ROLE_OF[name] ?? name;
const model = config.agents?.[role]?.model;
if (!model) {
  console.error(`agents.${role}.model is not set in ${configPath}`);
  process.exit(1);
}
process.stdout.write(model);
