# template

Starter template for `toolchainjp` projects. Creating a repo from this template gives you a
consistent baseline instead of setting the same things up by hand each time:

- a **two-branch development workflow** (`main` + `development`) that keeps `main` releasable,
- **issue and PR templates** under [`.github/`](.github/) so reports and reviews arrive in a
  predictable shape,
- **Claude Code wired into GitHub Actions**, so `@claude` works in issues and PRs from day one.

## Development workflow

This template is opinionated about branching. The rules:

| Branch | Purpose | Direct commits |
| --- | --- | --- |
| `main` | Always releasable. Reflects what is deployed. | **Never** — PR only |
| `development` | Integration branch. Where work lands first. | Avoid — PR preferred |
| `feature/*`, `fix/*` | One branch per issue or change. | Yes |

The normal cycle:

1. Branch off `development` — `git switch development && git pull && git switch -c feature/<short-name>`
2. Commit and push to your branch, then open a PR **targeting `development`**.
3. Once reviewed and merged, `development` accumulates changes.
4. To release, open a PR from `development` → `main`. Merging that is the release.

Never `git commit` on `main` or `development` locally and push. If you catch yourself on the wrong
branch with uncommitted work, `git stash`, switch to a proper branch, then `git stash pop`.

### Setup after copying the template

Two things are **not** carried over by "Use this template" and need doing once per new repo:

- **Branches.** Only the default branch is copied unless you tick **"Include all branches"** on the
  create-repo screen. If you forget, recreate `development` with
  `git switch -c development && git push -u origin development`.
- **Branch protection.** Protection rules are never copied. To make the "no commits to `main`" rule
  actually enforced rather than merely documented, go to Settings → Rules → Rulesets (or Branches →
  Add rule) and, for `main` and `development`, require a pull request before merging and block force
  pushes.

## Claude Code in GitHub Actions

This template ships with [`.github/workflows/claude.yml`](.github/workflows/claude.yml), which runs
[`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action) whenever `@claude`
is mentioned in an issue, an issue comment, a PR review, or a PR review comment — and when an issue
whose title or body mentions `@claude` is opened or assigned.

### Authentication

The workflow authenticates with `${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` — a Claude subscription
token rather than a metered API key. Keeping it as an **organization secret** with repository access
set to *All repositories* means repos created from this template inherit it automatically, with no
per-repo setup.

#### Getting the token

1. Install Claude Code locally if you haven't: `npm install -g @anthropic-ai/claude-code`
2. Run `claude setup-token`. It opens a browser, asks you to sign in to the Claude account whose
   Pro/Max subscription should pay for the runs, and prints a long-lived token (`sk-ant-oat01-…`).
   The command requires a paid subscription; on a free account it will not issue a token.
3. Copy the token and add it as a secret named **`CLAUDE_CODE_OAUTH_TOKEN`**:
   - org-wide (preferred): Organization → Settings → Secrets and variables → Actions → *New
     organization secret*, repository access *All repositories*;
   - or per repo: Settings → Secrets and variables → Actions → *New repository secret*.

Treat the token like a password — it grants access to the subscription. Rotate it by re-running
`claude setup-token` and updating the secret.

Note that **"Use this template" copies files only**; secrets, variables, and Actions settings are
never copied. Organization secrets also only reach **public** repositories on the GitHub Free plan,
so a private repo created from this template needs its own `CLAUDE_CODE_OAUTH_TOKEN` repository
secret, or the workflow will run with an empty token and fail. Register it once with:

```bash
claude setup-token                       # prints the token
bash scripts/bootstrap-secrets.sh        # asks for the token and sets the repository secret via gh
```

The script also offers to set `SLACK_BOT_TOKEN` (optional, for harness notifications). Values are
entered interactively and never written to disk.

To use a metered API key instead, swap the input for `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}`.

### Optional tweaks

- Give Claude a fixed job with `prompt:` in the workflow's `with:` block — without it, Claude follows
  the instructions in the comment that tagged it.
- Restrict or extend tools with `claude_args`, e.g. `'--allowed-tools Bash(gh pr:*)'`, or pin a model
  with `'--model claude-opus-5'`. See the
  [action usage docs](https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md).
- `additional_permissions: actions: read` is already set so Claude can read CI results on PRs.
- Adjust the `permissions:` block if Claude needs write access (e.g. `contents: write` and
  `pull-requests: write` to let it push commits or open PRs).

## Agent harness

This template also ships an **agent operating harness**: a pre-defined permission policy
(`.claude/settings.json`), hooks that enforce format / lint / typecheck / test and block
irreversible operations (`.claude/hooks/`), a read-only reviewer subagent, `/plan` → approval →
`/implement` → `/verify` → `/review` commands, CI with evals, and one-way Slack notifications.

Start with [`docs/agent-harness/GUIDE.md`](docs/agent-harness/GUIDE.md) — it explains how the
pieces fit together, with diagrams, and how to use the repository day to day
([日本語版](docs/agent-harness/GUIDE.ja.md)). For the rules themselves see
[`docs/agent-harness/POLICY.md`](docs/agent-harness/POLICY.md) — it explains the
permission tiers, the two human approval gates, the kill switch, and the per-project setup
checklist. Project-specific facts (approvers, deploy target, budget, commands) live in
`.claude/harness.config.json`; copy `.claude/harness.config.example.json` to create it.
