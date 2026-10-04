#!/usr/bin/env node
// Puts the walkthrough block at the top of a pull request body, replacing the previous
// one. Only the text between the markers is touched, so anything a person wrote stays.
//
//   node scripts/walkthrough/update-pr-body.mjs --repo owner/name --number 12 --block block.md
//   node scripts/walkthrough/update-pr-body.mjs --body-file body.md --block block.md --stdout
//
// Requires GITHUB_TOKEN (or gh's own auth) unless --stdout is used.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { START, END } from "./build.mjs";

/** Replaces an existing block, or prepends a new one. Idempotent. */
export function applyBlock(body, block) {
  const text = String(body ?? "");
  const s = text.indexOf(START);
  const e = text.indexOf(END);
  if (s >= 0 && e > s) return (text.slice(0, s) + block + text.slice(e + END.length)).trim() + "\n";
  return `${block}\n\n${text.trim()}`.trim() + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (n, d = null) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : d;
  };
  const blockFile = opt("block");
  if (!blockFile || !existsSync(blockFile)) {
    console.error("usage: update-pr-body.mjs --block <file> (--repo owner/name --number N | --body-file <file> --stdout)");
    process.exit(2);
  }
  const block = readFileSync(blockFile, "utf8").trimEnd();

  if (args.includes("--stdout")) {
    const bodyFile = opt("body-file");
    process.stdout.write(applyBlock(bodyFile && existsSync(bodyFile) ? readFileSync(bodyFile, "utf8") : "", block));
    process.exit(0);
  }

  const repo = opt("repo");
  const number = opt("number");
  if (!repo || !number) {
    console.error("--repo and --number are required without --stdout");
    process.exit(2);
  }
  const gh = (a, input) => execFileSync("gh", a, { encoding: "utf8", input, maxBuffer: 16 * 1024 * 1024 });
  const current = JSON.parse(gh(["api", `repos/${repo}/pulls/${number}`, "--jq", "{body: .body}"])).body || "";
  const next = applyBlock(current, block);
  if (next.trim() === current.trim()) {
    console.log("walkthrough unchanged");
    process.exit(0);
  }
  gh(["api", `repos/${repo}/pulls/${number}`, "-X", "PATCH", "-F", "body=@-"], next);
  console.log(`walkthrough written to ${repo}#${number}`);
}
