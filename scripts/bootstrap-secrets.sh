#!/usr/bin/env bash
# One-time setup for a repository created from this template.
#
# Registers the GitHub Actions secrets the harness needs. Organisation secrets
# cannot reach private repositories on the GitHub Free plan, so each repository
# gets its own copy. Secret values are read interactively (or from the
# environment) and are never written to disk or printed.
#
#   bash scripts/bootstrap-secrets.sh                # current repository
#   bash scripts/bootstrap-secrets.sh owner/repo     # another repository
#
# Env (optional, skips the prompt): CLAUDE_CODE_OAUTH_TOKEN, SLACK_BOT_TOKEN
# Requires: gh (authenticated; admin on the target repository).
set -euo pipefail

repo="${1:-}"
if [ -z "$repo" ]; then
  repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null) || {
    echo "usage: $0 [owner/repo]  (or run inside the repository)" >&2; exit 1; }
fi
command -v gh >/dev/null || { echo "gh CLI not found: https://cli.github.com" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "run: gh auth login" >&2; exit 1; }

register() { # name, description, required(yes|no)
  local name="$1" desc="$2" required="$3" value="${!1:-}"
  if [ -z "$value" ]; then
    if gh secret list -R "$repo" 2>/dev/null | grep -q "^${name}[[:space:]]"; then
      read -r -p "$name is already set on $repo. Replace? [y/N] " ans
      [[ "$ans" =~ ^[Yy]$ ]] || { echo "  keeping existing $name"; return 0; }
    fi
    echo "$desc"
    read -r -s -p "  $name (input hidden; empty = skip): " value; echo
  fi
  if [ -z "$value" ]; then
    [ "$required" = yes ] && echo "  $name is required by the harness; skipped for now" >&2
    return 0
  fi
  printf '%s' "$value" | gh secret set "$name" -R "$repo"
  echo "  set $name on $repo"
}

echo "Registering harness secrets on $repo"
register CLAUDE_CODE_OAUTH_TOKEN \
  "Claude subscription token used by claude-code-action and the evals. Create one with: claude setup-token" yes
register SLACK_BOT_TOKEN \
  "Slack bot token (scope chat:write) for notifications. Leave empty to skip Slack." no

echo
echo "Done. The remaining one-time steps are in docs/agent-harness/POLICY.md, section 9."
