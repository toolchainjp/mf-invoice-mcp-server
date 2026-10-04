# エージェント運用ハーネス 設計メモ（PLAN）

状態: **承認待ち**（このメモが承認されるまで実装ファイルは書かない）
作成日: 2026-08-25
対象ブランチ: `docs/development-workflow` から新規ブランチを切る（レイヤーごと）

---

## 0. Explore の結果（事実）

### 0.1 リポジトリの現状

| 項目 | 事実 |
| --- | --- |
| 言語 / ランタイム | **なし**。ソースコード・`package.json`・lint/format/typecheck/test の定義が一切存在しない（テンプレートの骨格のみ） |
| 追跡ファイル | `README.md`, `.github/workflows/claude.yml`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.md` の 5 件 |
| `.claude/` | `settings.local.json` のみ（git push / gh pr / gh auth / git fetch の allow）。グローバル ignore で未追跡。`settings.json`・hooks・commands・agents は無い |
| `CLAUDE.md` | 無い |
| `.mcp.json` | 無い |
| CI | 無い（`claude.yml` のみ） |
| deploy ワークフロー | **無い**。README には「レビュー・マージ後に deploy」と書かれているが、テンプレートにはデプロイ定義が存在しない |
| シークレット参照名 | `secrets.CLAUDE_CODE_OAUTH_TOKEN`（`claude.yml:38`、README）。README に代替として `secrets.ANTHROPIC_API_KEY` の記載あり。値は読んでいない |
| ブランチ | `main`（default）, `development`, `docs/development-workflow`（現在地、`main` と同一内容）。`origin/development` は古く、`claude.yml` と README 拡充が入っていない |
| ローカル環境 | Claude Code **2.1.245**、Node 24.14.1 / npm 11.11.0、Python 3.12、jq 1.7、gh 2.96.0。pnpm 無し。サンドボックス依存（bwrap / socat）無し |

### 0.2 `claude.yml` の現行動作（壊さない対象）

- トリガ: `issue_comment` / `pull_request_review_comment` / `pull_request_review` / `issues(opened, assigned)` で本文に `@claude` を含むとき
- `permissions`: contents/pull-requests/issues **read**, id-token write, actions read
- `anthropics/claude-code-action@v1`、`claude_code_oauth_token` 認証、`additional_permissions: actions: read`
- `prompt` / `claude_args` は未設定（コメントアウト）

### 0.3 確認済みスキーマ（公式ドキュメント + `claude --help` + schemastore の JSON Schema）

**settings.json**（`https://json.schemastore.org/claude-code-settings.json` で検証可能）
- `permissions.{allow,ask,deny,additionalDirectories,defaultMode,disableBypassPermissionsMode}`
- ルール構文: `Bash(prefix *)`（末尾 `:*` も同義、複合コマンドは各サブコマンドを個別に評価）、`Read(path)` / `Edit(path)`（gitignore 構文。`/path`=プロジェクト相対、`//path`=絶対。deny の `Read(.env)` は任意の深さに一致）、`WebFetch(domain:host)`、`mcp__<server>__<tool>`、`mcp__*`（deny/ask のみ glob 可）、`Agent(name)`
- 優先順位: deny > ask > allow。PreToolUse hook の exit 2 は allow より強い
- 公式警告: `Bash(curl https://x/ *)` のような **引数制限は脆い** → curl/wget は deny し、URL 検査は PreToolUse hook で行うのが推奨手法
- `enableAllProjectMcpServers` / `enabledMcpjsonServers: string[]` / `disabledMcpjsonServers: string[]`
- `env`（全セッションと子プロセスに環境変数を配る。OTEL 設定はここ）
- `sandbox.{enabled, autoAllowBashIfSandboxed, network.allowedDomains, network.deniedDomains, excludedCommands, filesystem.*}`（macOS / Linux / WSL2。Linux は bubblewrap + socat が必要）

**hooks**
- 形: `hooks.<Event>[] = { matcher, hooks: [{ type: "command", command, timeout, ... }] }`
- 入力 (stdin JSON): `session_id, cwd, hook_event_name, tool_name, tool_input, tool_use_id`、PostToolUse は `+tool_response`、Stop は `+stop_hook_active, last_assistant_message`
- 出力: exit 0 = 続行、**exit 2 = ブロック（stderr が理由として Claude に渡る）**。JSON 出力で `hookSpecificOutput.permissionDecision: "deny"` + `permissionDecisionReason`（PreToolUse）、`decision: "block"` + `reason`（Stop）
- **PostToolUse はブロックできない**（ツールは既に実行済み）。exit 2 の stderr は Claude に見える → 「失敗結果を Claude に返す」要件はこれで満たせる
- Stop hook は `stop_hook_active == true` のときに再ブロックしない（無限ループ防止）
- `${CLAUDE_PROJECT_DIR}` でスクリプトを絶対参照。hook プロセスにも環境変数として渡る

**subagents**（`.claude/agents/<name>.md`）
- frontmatter: `name`, `description`, `tools`（カンマ区切り allowlist）, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `memory`, `hooks` など
- `tools` を指定するとそれ以外は使えない

**slash commands**（`.claude/commands/<name>.md`。skills と統合されたが `.claude/commands/` は引き続き有効）
- frontmatter: `description`, `argument-hint`, `allowed-tools`, `disallowed-tools`, `disable-model-invocation`, `context: fork`, `agent`, `model` など
- 置換: `$ARGUMENTS`, `$0`/`$1`, `${CLAUDE_PROJECT_DIR}`
- `` !`cmd` `` で実行前にシェルを埋め込める（`allowed-tools` に該当 `Bash(...)` が必要）

**`.mcp.json`**
- `{ "mcpServers": { "<name>": { "type": "stdio|http|sse", "command", "args", "env", "url", "headers" } } }`
- `${VAR}` / `${VAR:-default}` を `command / args / env / url / headers` で展開。未設定なら未展開のまま起動（警告）
- **非対話（`claude -p`、claude-code-action）ではプロジェクトスコープのサーバーは承認プロンプトなしで自動ロードされる**。除外したいものは `disabledMcpjsonServers` に書く。対話セッション向けに `enabledMcpjsonServers` を settings.json にコミットしておけば承認済み扱いになる（フォルダ trust 後）

**claude-code-action@v1**（`action.yml` を直接確認）
- 入力: `prompt`, `claude_args`, `settings`, `claude_code_oauth_token`, `anthropic_api_key`, `label_trigger`（default `claude`）, `assignee_trigger`, `trigger_phrase`, `base_branch`, `branch_prefix`, `additional_permissions`, `use_sticky_comment`, `track_progress`, `allowed_bots` 等
- 出力: `conclusion`, `execution_file`, `branch_name`, `structured_output`, `session_id`
- `claude_args` に `--max-turns N`, `--max-budget-usd X`, `--model`, `--allowedTools`, `--disallowedTools`, `--append-system-prompt`, `--permission-mode` を渡せる（`--max-turns` は action ドキュメントで明示。ローカル CLI の `--help` には出ないが `claude --max-turns 3 -p` は受理された）

**OpenTelemetry**
- `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_METRICS_EXPORTER`, `OTEL_LOGS_EXPORTER`, `OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_LOG_USER_PROMPTS` 等。endpoint 未設定だと export が失敗するだけでセッションは動く → 「未設定なら無効」を満たすには **`CLAUDE_CODE_ENABLE_TELEMETRY` 自体を settings に書かず、CI 側で `OTEL_EXPORTER_OTLP_ENDPOINT` が非空のときだけ env を注入**する設計にする

### 0.4 未確認（推測で書かない項目）

| 項目 | 状態 |
| --- | --- |
| claude-code-action 実行環境でサンドボックス（bubblewrap）が使えるか | 未確認。Plan では **sandbox はデフォルト無効**にし、有効化手順のみ POLICY に書く |
| claude-code-action が `.claude/settings.json` の `hooks` を実行するか | ドキュメント上 `-p` は project settings の hooks を実行する。action 自体の挙動は実機で確認するまで「未確認」扱い |
| `--max-budget-usd` が OAuth トークン（サブスク）認証で意味を持つか | 未確認。設定は入れるが効果は保証しない |
| `enabledMcpjsonServers` が action（非対話）で必要か | ドキュメント上は不要（自動ロード）。対話セッション向けに入れる |

---

## 1. 設計上の重要な判断（先に読んでほしい）

### 1.1 このリポジトリには「コード」が無い → コマンドは config 駆動にする

format / lint / typecheck / test の実体はテンプレート利用先のスタックで決まる。テンプレート側でスタックを決め打ちしないため、
`harness.config.json` に `commands.{format, lint, typecheck, test}` を持ち、hook / CI / `/verify` はこれを実行する。
テンプレート自体（このリポジトリ）では、`commands` は **ハーネス自身のテストとスクリプト検証**（`tests/harness/`、shellcheck 相当、JSON schema 検証）を指す。

→ 受け入れ基準「PostToolUse が lint エラーで失敗する」「Stop がテスト失敗で止まる」は、テスト内で `commands` を **失敗するダミーコマンドに差し替えた config** を与えて検証する。

### 1.2 hook / notify の実装言語は **bash + jq**（hook）と **Node 標準ライブラリのみ**（notify）

- hook: 依存ゼロ。macOS / Linux で動く POSIX 互換の bash。`jq` は入力 JSON のパースに必須（macOS は `brew install jq`、CI は ubuntu に同梱）。`jq` が無ければ hook は **fail-closed**（PreToolUse は deny、Stop はブロック）で理由を出す
- notify: Block Kit JSON の組み立てと `fetch` は Node 24 標準で足りる。`node --test` で単体テスト。**npm 依存は追加しない**
- 理由: テンプレート利用先のスタックが不明なので、Python / Node どちらかの依存を強制しない。Node は claude-code-action（Bun）と GitHub Actions ランナーに必ずある

### 1.3 サンドボックスは「任意」にする

Tier 2 の「サンドボックス内で自動許可」は理想だが、ランナー / 開発機に bubblewrap が無いと機能しない。`settings.json` には `sandbox` ブロックを **書かず**、代わりに:
- Tier 2 コマンド（`npm ci`, `npm run build` 等）は `permissions.allow` で許可
- ネットワークは `curl/wget` を deny + PreToolUse hook で URL 検査
- POLICY に「bubblewrap を入れて `sandbox.enabled: true` を `settings.local.json` に書くと OS レベルの隔離が加わる」と手順を書く

### 1.4 `.github/workflows/**` と `.claude/**` の編集を Tier 3 にしつつ、ハーネス自身の PR は人が作る

このタスクの実装自体は Tier 3 パスを触るが、それは **対話セッションで人（あなた）が承認した状態**で行う。テンプレート導入後は Claude Code は自力で hook / settings を編集できず、`/absorb` は差分の **提案**（パッチファイルまたは PR 本文への記載）までを行い、適用は人がする。

### 1.5 deploy ワークフローは存在しないので「触らない」を満たす

`deploy.done` 通知は「既存 deploy ワークフローに通知ステップを追加」ではなく、`workflow_call` で呼べる再利用可能ワークフロー `notify-slack.yml` を用意し、**利用先が deploy ワークフローから 1 ステップ呼ぶ**形にする。テンプレートには deploy を追加しない。

### 1.6 レビュアーの独立性は 2 経路で担保

- 対話: `/review` が `context: fork` + `agent: reviewer` で起動。fork は親の会話を **引き継がない**独立コンテキスト
- CI: `pull_request` トリガの別ジョブで `claude-code-action` を `--agent reviewer` 相当（`claude_args: --agent reviewer`）で起動し、入力は「設計メモ + `gh pr diff`」のみ

---

## 2. 追加・変更ファイル一覧

### レイヤー A: 設定と権限（PR #1）

| ファイル | 責務 |
| --- | --- |
| `.claude/settings.json` | 権限ポリシー（allow / deny / ask）、hooks 登録、`enabledMcpjsonServers`、`disableBypassPermissionsMode: true`。`$schema` を付ける |
| `.claude/harness.config.example.json` | プロジェクト固有値のサンプル。実値は空 |
| `.claude/harness.config.schema.json` | JSON Schema。必須項目・型を定義。hook / CI / notify はこれで検証 |
| `.claude/harness.config.json` | **コミットしない**（`.gitignore` に追加）。利用先が example をコピーして作る |
| `.gitignore` | 新規。`.claude/harness.config.json`, `.claude/settings.local.json`, `node_modules/`, eval 出力 |

`harness.config.json` の構造（草案）:
```jsonc
{
  "$schema": "./harness.config.schema.json",
  "approvers": [],                       // 必須: GitHub ハンドル 1 件以上
  "deploy": {
    "target": "",                        // 必須: 例 "cloudflare-workers"
    "productionBranch": "",              // 必須: 例 "main"
    "productionPatterns": []             // 必須(空可): 本番を示す URL / env の正規表現
  },
  "budget": { "maxTurns": 30, "maxUsd": 5, "maxMinutes": 30 },   // 保守的な既定値
  "protectedPaths": [".github/workflows/**", ".claude/**", ".mcp.json", ".env*", "**/secrets/**"],
  "commands": { "format": "", "lint": "", "typecheck": "", "test": "" },  // 必須: test は空不可
  "mcp": { "servers": [], "envRefs": {} },  // 例 {"servers":["github"],"envRefs":{"github":["GITHUB_PERSONAL_ACCESS_TOKEN"]}}
  "slack": {
    "channel": "",                       // 空なら通知スキップ
    "mentionApprovers": true,
    "tokenSecretName": "SLACK_BOT_TOKEN",
    "events": { "plan.ready": true, "escalation": true, "pr.opened": true, "verify.report": true,
                "blocked": true, "ci.failed": true, "eval.failed": true, "deploy.done": true }
  }
}
```
必須項目: `approvers[0]`, `deploy.target`, `deploy.productionBranch`, `commands.test`。

`settings.json` の permissions 草案:
```jsonc
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "defaultMode": "default",
    "disableBypassPermissionsMode": true,
    "allow": [
      "Read", "Edit", "Glob", "Grep",
      "Bash(git add *)", "Bash(git commit *)", "Bash(git branch *)", "Bash(git switch *)", "Bash(git checkout -b *)",
      "Bash(git diff *)", "Bash(git log *)", "Bash(git status *)", "Bash(git stash *)",
      "Bash(npm ci)", "Bash(npm install)", "Bash(npm run *)", "Bash(npm test *)", "Bash(npx *)",
      "Bash(node *)", "Bash(bash tests/harness/*)",
      "WebFetch(domain:registry.npmjs.org)", "WebFetch(domain:github.com)"
    ],
    "deny": [
      "Bash(git push --force *)", "Bash(git push -f *)", "Bash(git push * --force*)",
      "Bash(rm -rf *)", "Bash(rm -fr *)", "Bash(sudo *)",
      "Bash(curl *)", "Bash(wget *)",
      "Read(.env)", "Read(.env.*)", "Read(**/secrets/**)", "Read(~/.ssh/**)", "Read(~/.aws/**)",
      "Edit(.env)", "Edit(.env.*)", "Edit(/.github/workflows/**)", "Edit(/.claude/**)", "Edit(/.mcp.json)",
      "mcp__*"                                  // 標準セット以外はデフォルト deny（allow は個別に mcp__<server>__* で）
    ],
    "ask": [
      "Bash(git push *)", "Bash(gh pr create *)", "Bash(gh pr merge *)", "Bash(git reset --hard *)"
    ]
  },
  "enabledMcpjsonServers": [ /* 標準セット名。§I の決定後に埋める */ ],
  "hooks": { /* レイヤー B */ }
}
```
※ `mcp__*` の deny と `mcp__github__*` の allow を同居させると deny が勝つ。標準セットは **deny 側を `mcp__*` にせず、`disabledMcpjsonServers` + 「.mcp.json に無いサーバーは存在しない」で担保**するか、deny を個別列挙にするか → **質問 Q5**。

### レイヤー B: Hooks（PR #2）

| ファイル | 責務 |
| --- | --- |
| `.claude/hooks/lib.sh` | 共通: stdin JSON 読み込み、config 読み込み・必須項目チェック、glob→正規表現、deny 出力ヘルパ |
| `.claude/hooks/pre-tool-use.sh` | `Bash`: 破壊コマンド / force push / curl・wget / 本番パターン一致 / デプロイコマンド（`wrangler deploy`, `vercel --prod`, `kubectl apply`, `terraform apply` 等）をブロック。`Read/Edit/Write/NotebookEdit/Bash のリダイレクト`: `protectedPaths` をブロック。理由 + 「人に確認せよ」を stderr と JSON で返す |
| `.claude/hooks/post-tool-use.sh` | `Edit\|Write\|NotebookEdit` 後: `commands.format` → `lint` → `typecheck` を実行。失敗出力を stderr に流し exit 2（Claude に見える） |
| `.claude/hooks/stop.sh` | `commands.test` 実行 → 失敗なら `decision: block`。`git diff` + 未追跡ファイルをシークレット正規表現で走査（`sk-ant-`, `AKIA`, `ghp_`, `xoxb-`, `BEGIN .* PRIVATE KEY` 等）→ 検出でブロック。`stop_hook_active` で再帰防止 |
| `.claude/hooks/require-config.sh` | `UserPromptSubmit`（matcher なし）: 入力が `/plan` または `/implement` で始まり、config の必須項目が空なら exit 2 で止め、設定を要求 |
| `tests/harness/run.sh` | 全 hook テストのランナー（bash）。fixture JSON を stdin に流して exit code と stderr を assert |
| `tests/harness/hooks/*.sh` | ケース: `rm -rf /`, `git push --force`, `.env` Read, 本番 URL curl → deny。`npm test`, `src/foo.ts` Edit → allow。lint 失敗 config で PostToolUse exit 2。test 失敗 config で Stop block。config 空で `/plan` block |

matcher: PreToolUse は `Bash|Read|Edit|Write|NotebookEdit`、PostToolUse は `Edit|Write|NotebookEdit`、Stop は matcher なし。

### レイヤー C: 指示ファイル（PR #3）

| ファイル | 責務 |
| --- | --- |
| `CLAUDE.md` | §2-C の全セクション。基本情報は「テンプレート: コード無し、`harness.config.json` の commands を参照」と書く。MCP 返り値を信頼しない旨、`.mcp.json` 編集禁止を含める |

### レイヤー D: スラッシュコマンド + レビュアー（PR #4）

| ファイル | 責務 |
| --- | --- |
| `.claude/commands/plan.md` | `disable-model-invocation: true`, `allowed-tools: Read Grep Glob Bash(git diff *) Bash(git log *) Edit(docs/plans/**)`。`docs/plans/<date>-<slug>.md` を書き「承認待ち」で停止。実装ファイルへの Edit は allowed-tools 外なのでできない |
| `.claude/commands/implement.md` | `$0` = plan path。設計メモに無い変更が必要なら停止・質問 |
| `.claude/commands/verify.md` | `commands.*` を順に実行、§5 フォーマットで報告 |
| `.claude/commands/review.md` | `context: fork`, `agent: reviewer`, `background: false`。入力は設計メモ + `git diff <base>` |
| `.claude/commands/absorb.md` | `$ARGUMENTS` のフィードバックを eval / CLAUDE.md / hook のどれに落とすか提案。Tier 3 パスは **パッチ提案のみ**（`docs/absorb/<date>.patch` に書く） |
| `.claude/agents/reviewer.md` | `tools: Read, Grep, Glob, Bash`, `permissionMode: default`。Bash は `git diff/log/show` 専用と prompt で制限し、加えて **subagent frontmatter の `hooks` で PreToolUse を張り Bash を `git (diff|log|show|status)` 以外 deny**（frontmatter `hooks` はドキュメントで確認済み）。Blocking / Should fix / Nit、「問題なし」時は確認項目を列挙 |

### レイヤー E: CI / claude-code-action / eval / OTEL（PR #5）

| ファイル | 責務 |
| --- | --- |
| `.github/workflows/ci.yml` | `pull_request`: `config-check`（schema 検証）→ `harness-tests`（`tests/harness/run.sh`, `node --test tests/harness/notify`）→ `project-checks`（`commands.*` を config から実行。config 未作成なら **skip して warning**）→ `eval`（`CLAUDE.md`, `.claude/**`, `evals/**`, `.mcp.json` に差分があるときのみ、`dorny/paths-filter` 不使用で `git diff --name-only` による自前判定）。失敗時 `ci.failed` 通知 |
| `.github/workflows/claude.yml` | **変更あり（明示）**: (1) `claude_args` に `--max-turns ${{ vars.CLAUDE_MAX_TURNS \|\| 30 }} --max-budget-usd ...` を追加、(2) `issues: [labeled]` を追加し `plan` ラベル時は `prompt` で「設計メモをコメントで返し PR を作らない」動作（ジョブを分ける: 既存 `claude` ジョブの `if` は変えない）、(3) `permissions` に `contents: write`, `pull-requests: write`, `issues: write` を追加（PR / コメント作成に必要。**Q2**） |
| `.github/workflows/claude-review.yml` | `pull_request: [opened, synchronize, ready_for_review]`（bot 自身の PR も含む）。`claude_args: --agent reviewer --max-turns 15`、`prompt` に「設計メモパス + `gh pr diff` のみ入力」。結果を PR コメントに投稿し、`pr.opened` 通知 |
| `.github/workflows/notify-slack.yml` | `workflow_call` 再利用ワークフロー。入力 `event`, `payload`(JSON), `thread_key`。`scripts/notify/send.mjs` を呼ぶ。`continue-on-error: true` |
| `evals/README.md`, `evals/promptfooconfig.yaml`, `evals/cases/{001-escalation,002-verify-report,003-reviewer-format}/case.yaml`, `evals/rubrics/*.md` | promptfoo（`npx promptfoo@<pin>` で実行、`package.json` 不要）。judge は `llm-rubric`、出力 `evals/output/*.json` を artifact 保存 |
| `docs/agent-harness/OTEL.md` または POLICY 内節 | `vars.OTEL_EXPORTER_OTLP_ENDPOINT` が非空のときのみ CI ステップで `CLAUDE_CODE_ENABLE_TELEMETRY=1` 等を `settings` 入力経由で注入 |

### レイヤー F: Slack 通知（PR #6）

| ファイル | 責務 |
| --- | --- |
| `scripts/notify/build-message.mjs` | `(event, payload, config) → Block Kit JSON`。10 行以内、悪い知らせ先頭、差分・ログ全文・シークレット形式文字列を **サニタイズ（正規表現で除去）**。承認必要イベントのみメンション |
| `scripts/notify/send.mjs` | `chat.postMessage`。`thread_key`（`<repo>#<number>`）→ `ts` の対応を GitHub Actions cache/artifact ではなく **Issue/PR の hidden コメント `<!-- slack-thread: ts -->`** に保存し再利用（artifact は run をまたいで探しにくいため）。トークン未設定 / channel 空 → exit 0 で skip |
| `scripts/notify/README.md` | イベント一覧と payload 形式 |
| `tests/harness/notify/*.test.mjs` | 各イベントの JSON 生成、サニタイズ、skip 挙動、thread 再利用の単体テスト（`node --test`、ネットワークは fetch をモック） |

### レイヤー G: MCP（PR #7）

| ファイル | 責務 |
| --- | --- |
| `.mcp.json` | 標準セット（**Q5 の回答次第**。私の推奨は GitHub のみ、または空）。全て `${VAR}` 参照 |
| `docs/agent-harness/MCP_CATALOG.md` | 冒頭に「カタログ外サーバー追加のセキュリティレビュー手順」、続いて承認済みサーバー表（用途 / 権限 / 送信先 / 認証 / 有効化手順）。候補として GitHub / Context7(ドキュメント参照) / Playwright / Postgres read-only / Figma を **カタログに記載**（`.mcp.json` には入れない） |

### レイヤー H: ポリシー文書（PR #8。PR #1 と同時でも可）

| ファイル | 責務 |
| --- | --- |
| `docs/agent-harness/POLICY.md` | §2-G 全項目 + サンドボックス有効化手順 + OTEL 手順 + 「MCP を増やしても Tier 3 は緩めない」 |
| `README.md` | ハーネスの存在と POLICY へのリンクを 1 節追加（既存内容は維持） |

---

## 3. 既存ワークフローへの影響

| 影響 | 内容 | リスク |
| --- | --- | --- |
| `claude.yml` の permissions 拡大 | read → write（contents / pull-requests / issues）。無いと PR もコメントも作れない。**現状の read 権限では README が謳う「PR を作る」動作自体が成立していない**可能性が高い | 中。Q2 で確認 |
| `claude.yml` に `issues: labeled` 追加 | 既存の `if` 条件は変更しない。`plan` ラベル用ジョブは別ジョブ | 低 |
| `claude.yml` に `claude_args` 追加 | `--max-turns` で長いタスクが途中で止まる可能性。既定 30 | 低〜中 |
| `.claude/settings.json` の新設 | `settings.local.json` の `Bash(git push *)` allow は、project の `ask` より弱い（ask > allow）→ ローカルでも push 時に確認が出るようになる | 意図どおり |
| `claude-code-action` 実行時に hooks が走る | Stop hook がテストを毎ターン実行 → 実行時間増。`commands.test` が重い場合は利用先で調整 | 中 |
| `disableBypassPermissionsMode: true` | `--dangerously-skip-permissions` が使えなくなる | 意図どおり |
| deploy | 存在しないため影響なし | なし |

---

## 4. 依存の追加

| 依存 | 理由 | 代替 |
| --- | --- | --- |
| `jq`（システム） | hook の JSON パース。bash だけで JSON を安全に読む手段が無い | 無ければ fail-closed |
| `promptfoo`（`npx` で都度実行、pin） | eval ランナー。自前実装を避ける要件 | eval ジョブでのみ使用 |
| `node`（システム。既にある） | notify スクリプトとテスト | — |

npm パッケージのインストール（`package.json`）は **追加しない**。

---

## 5. 判断が必要な点（質問）

**Q1. プロジェクト向けコマンドの扱い**
このテンプレートにはコードが無いので、`commands.{format,lint,typecheck,test}` は利用先が設定する前提にする（§1.1）。テンプレート自体の CI では `tests/harness/run.sh` と `node --test` を「test」とみなす。この方針でよいか。

**Q2. `claude.yml` の GitHub 権限**
現状 `contents: read` / `pull-requests: read` / `issues: read` のままだと Claude はブランチも PR もコメントも作れない。`write` に上げてよいか（上げない場合、`plan` ラベルの「コメントで返す」も動かない）。

**Q3. `plan` ラベルのトリガ**
`issues: [labeled]` で `plan` ラベルが付いたら設計メモをコメント投稿、という設計でよいか。`@claude` メンションが無くても起動させるか（既存 `if` は「メンション必須」）。私の推奨: ラベル付与時は **メンション不要で起動**（ラベルを付ける行為自体が明示的な指示のため）。

**Q4. レビュアー CI の起動条件**
`pull_request` の全 PR に対して走らせると、人が作った PR にも Claude レビューが付く。(a) 全 PR、(b) `claude/` ブランチの PR のみ、(c) `review` ラベル時のみ。私の推奨: **(a)**（品質基準を変えない方針と一致）。ただしコスト増。

**Q5. MCP 標準セット**
候補の評価:
- GitHub MCP: claude-code-action は `gh` CLI 相当を持ち、対話でも `gh` が使える。**重複するので不要**と判断
- ドキュメント参照（Context7 等）: 外部 SaaS にクエリが出る。送信先レビューが要る
- Playwright: E2E がある利用先のみ
- DB read-only: 利用先依存
→ 私の推奨: **テンプレートの `.mcp.json` は空（`{"mcpServers":{}}`）で置き、全候補はカタログに記載**。標準セットが空なら `permissions.deny: ["mcp__*"]` で「デフォルト deny」が最も単純に成立し、利用先が有効化する際に deny を個別化する。これでよいか、それとも 1 つは同梱するか。

**Q6. Slack スレッド `ts` の保存先**
仕様は「artifact または Issue コメント」。私の推奨は **Issue/PR の hidden コメント**（`<!-- harness-slack-thread: <ts> -->`）。artifact は run をまたいだ検索が煩雑で、`actions/cache` はキーの衝突で消えることがある。Issue コメントが 1 件増える点は許容できるか。

**Q7. budget の既定値**
`maxTurns: 30`, `maxUsd: 5`, `maxMinutes: 30`（GitHub Actions の `timeout-minutes` に反映）でよいか。`maxUsd` は OAuth 認証時の効果が未確認。

**Q8. `development` ブランチの扱い**
`origin/development` は `main` より古い（`claude.yml` 無し）。各 PR のターゲットは README の運用どおり **`development`** にするか、テンプレート整備中は `main` 直接にするか。`development` を選ぶ場合、先に `main` → `development` を同期する PR が必要。

**Q9. hook が `jq` 不在のとき**
fail-closed（全ツールを deny して「jq を入れよ」と返す）でよいか。開発機で jq を入れ忘れると何もできなくなるが、安全側。

**Q10. PostToolUse の実行対象**
「編集されたファイルに対して」format → lint → typecheck を実行するには、`commands.*` がファイルパス引数を受け取れる必要がある。`{file}` プレースホルダを config の文字列に埋め込み（例 `"lint": "npx eslint {file}"`）、無ければファイル無しで全体実行、という仕様でよいか。

---

## 6. 実装順とレビュー観点

1. A（config + settings + gitignore）+ H（POLICY 骨子）— スキーマ検証で「警告なく読み込む」を確認
2. B（hooks + tests）— `tests/harness/run.sh` を緑にする
3. C（CLAUDE.md）
4. D（commands + reviewer）— `/plan` が Edit(docs/plans/**) 以外書けないことを確認
5. F（notify + tests）— ネットワーク無しで単体テスト
6. E（CI / claude.yml / eval / OTEL）— `act` は使わず、YAML の構文検証と `git diff` で既存 job 不変を確認
7. G（.mcp.json + MCP_CATALOG）

各 PR は 1 レイヤー。PR 本文に「この PR で確認したこと / 未確認」を §5 形式で書く。

---

## 7. 承認済みの決定（2026-08-25）

| 質問 | 決定 |
| --- | --- |
| Q1 | config 駆動の `commands.*` を採用 |
| Q2 | `claude.yml` の GitHub 権限を write に上げる |
| Q3 | `plan` ラベルはメンション不要で起動 |
| Q4 | レビュアー CI は全 PR で実行 |
| Q5 | `.mcp.json` は空、候補はカタログに記載、`mcp__*` をデフォルト deny |
| Q6 | Slack スレッド `ts` は Issue/PR の hidden コメントに保存 |
| Q7 | サブスクのみ利用 → `budget` は `maxTurns` / `maxMinutes` の 2 項目。`maxUsd` は持たない |
| Q8 | `development` を `main`（09be5b5）に fast-forward 同期済み。PR は `development` 向け |
| Q9 | hook は **Node（依存ゼロ .mjs）** で実装。jq は使わない |
| Q10 | `{file}` プレースホルダ方式。example の既定は **ruff**（`ruff format {file}` / `ruff check {file}` / test は `pytest`）。typecheck は空（ruff は型検査をしないため利用先が設定） |

追加の設計判断:
- `.claude/harness.config.json` は **コミット対象**（承認者・デプロイ先・チャンネル ID は秘密ではない）。テンプレートには含めず、利用先が example をコピーして作る。CI はこのファイルが無ければ config 依存ジョブを skip し warning を出す
- hook は config が無い場合 `harness.config.example.json` を **フォールバック**として読む（`protectedPaths` 等のポリシー値を二重定義しないため）。ただし Stop hook のテスト実行と `/plan` `/implement` は実 config が無いと動かさない
- 環境変数 `HARNESS_CONFIG` で config パスを上書きできる（テストと CI 用）

## 8. 実装中の変更（Plan からの差分）

- `protectedPaths` を「書き込み禁止（読み取りは可）」とし、読み書きとも禁止する `secretPaths` を新設した。理由: 実機検証で planner が `harness.config.json` を読めず承認者を埋められなかったため。`.claude/**` / `.github/workflows/**` / `.mcp.json` は設定・コードであり秘密ではない
- `/plan` は `allowed-tools` ではなく `planner` サブエージェント（`context: fork` + パス制限 hook）で「docs/plans/ 以外に書けない」を強制する。`allowed-tools` は許可の追加であって制限にならないため
- PostToolUse はプロジェクト外のファイルと example 設定（プレースホルダ）では実行しない
- `disableBypassPermissionsMode` は公開スキーマでは文字列 `"disable"`
- promptfoo の `exec:` プロバイダと `file://` 参照は `evals/` ディレクトリ基準
