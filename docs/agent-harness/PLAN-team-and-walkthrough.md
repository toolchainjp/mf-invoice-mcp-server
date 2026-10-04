# エージェントチーム構成と PR ウォークスルー 設計メモ（PLAN）

状態: **承認待ち**（承認まで実装ファイルは書かない）
作成日: 2026-08-25
基準ブランチ: `development`（`main` と内容一致）

---

## 0. Explore の結果（事実）

### 0.1 基本ハーネスの実装状況

**A〜I すべてマージ済み**（`main` に 42 ファイル）。PR #3 → #11 → #12（リリース）→ #13（bootstrap-secrets）。

| レイヤー | 状態 | 主なファイル |
| --- | --- | --- |
| A 権限 / config | 済 | `.claude/settings.json`, `harness.config.{schema,example}.json` |
| B hooks | 済 | `lib.mjs`, `pre-tool-use.mjs`, `post-tool-use.mjs`, `stop.mjs`, `require-config.mjs` |
| C Slack | 済 | `scripts/notify/{build-message,send}.mjs`（8 イベント） |
| D CLAUDE.md | 済 | §1〜§7 |
| E コマンド / subagent | 済 | `/plan /implement /verify /review /absorb`, `planner.md`, `reviewer.md` |
| F CI / eval | 済 | `ci.yml`, `claude-review.yml`, `notify-slack.yml`, `evals/` |
| G MCP | 済 | `.mcp.json`（空）, `MCP_CATALOG.md` |
| H POLICY | 済 | `POLICY.md` §0〜§10 |
| I bootstrap | 済 | `scripts/bootstrap-secrets.sh` |

既存 `settings.json` に `env` ブロックは無く、`permissions` に `Agent(...)` ルールも無い。hooks は `UserPromptSubmit / PreToolUse / PostToolUse / Stop` の 4 イベント。

### 0.2 subagent のモデル指定・並列・ネスト（公式ドキュメントで確認）

| 項目 | 事実 |
| --- | --- |
| モデル指定 | frontmatter `model:`。値は `sonnet` / `opus` / `haiku` / `fable` / フル ID / `inherit`。省略時は `inherit` |
| 解決順 | `CLAUDE_CODE_SUBAGENT_MODEL` 環境変数 → **呼び出しごとの `model` パラメータ** → frontmatter `model` → 親の model |
| 並列実行 | **可能。既定 20 同時**。`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`（正整数）で変更。超過すると `Concurrent subagent limit reached` で失敗し、Claude には再試行しないよう伝えられる |
| ネスト | **可能。既定 深さ 3**。`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`。`"1"` でネスト無効。深さ上限に達した subagent からは `Agent` ツールが取り上げられる |
| `maxTurns` | frontmatter で整数指定可 |
| 課金 | **呼び出しごと**（各 subagent は独立した API 呼び出し）。subagent の思考・ツール結果は自コンテキストに留まり、**返り値だけ**が親のコンテキストを消費する |
| hook | `SubagentStart` は **ブロック不可**（exit 2 は stderr 表示のみ）。`SubagentStop` はブロック可。両者とも matcher は `agent_type`。入力に `agent_id`（subagent 内でのみ存在）と `agent_type` が入る |
| 権限ルール | `Agent(<name>)` で subagent 単位、`Agent(model:opus)` のようにパラメータ単位の deny/ask が可能 |

→ **上限の強制は `SubagentStart` ではなく `PreToolUse`(matcher `Agent`) で行うしかない**（唯一 deny できる箇所）。

### 0.3 claude-code-action のコスト計上単位

- 課金は **API 呼び出し単位**。GitHub Actions の 1 ジョブ内で subagent を N 並列に走らせると、ジョブは 1 本でも **API 呼び出しとトークンは N 倍**
- `claude-code-action` の 1 ステップ = 1 Claude セッション。matrix で 3 ジョブに分ければ action 実行も 3 回（Actions 分数も 3 倍だが、ジョブは並列なので実時間は伸びない）
- サブスク（OAuth）認証のため金額上限は設定できない。制御は `--max-turns` と `timeout-minutes`、および本タスクで追加する `maxParallel`

### 0.4 既存 AI レビューツール

- リポジトリに `.coderabbit.yaml` / `sonar-project.properties` 等の設定ファイル **なし**
- PR #12 のレビュー・コメントに bot なし（`gh pr view --json comments` → Claude Review のコメントのみ）
- Org `toolchainjp` は **Free プラン**、リポジトリ 1 件、private。ブランチ保護 API は 403（Free + private では不可）
- GitHub App の一覧は現在のトークン権限では取得できず（401）。**「導入済みツールは無い」と判断したが、Org 管理画面での最終確認は人にお願いしたい（Q3）**

参考: CodeRabbit の無料枠は public リポジトリ向けで、private は有料。Copilot Code Review は Copilot 契約が前提。Free プランの private リポジトリでは **どちらも即座には使えない可能性が高い**。

### 0.5 Mermaid のレンダリング手段

- **GitHub はネイティブに Mermaid を描画する**。対象は Issues / Discussions / **Pull requests** / wiki / Markdown ファイル。記法は ` ```mermaid ` フェンス
- `@mermaid-js/mermaid-cli` は v11.16.0。PNG 化には Puppeteer（Chromium ダウンロード）が必要で、CI に数十 MB と 10〜30 秒の追加コスト
- → **PR 本文とコメントは GitHub ネイティブで足りる**。mermaid-cli は Slack に画像を貼りたい場合のみ（Q4）

### 0.6 未確認（推測で書かない）

| 項目 | 状態 |
| --- | --- |
| `claude-code-action` 内で `--agent <name>` がプロジェクトの `.claude/agents/` を解決するか | **未確認**。`main` にワークフローが載った今、次の PR で初めて実行される |
| action 内でプロジェクトの hooks が実行されるか | 未確認（ローカル `-p` では実行を確認済み） |
| `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` / `..._SPAWN_DEPTH` を `settings.json` の `env` で渡したときの action 内での有効性 | 未確認 |
| Org に GitHub App が入っていないこと | 権限不足で API 確認できず（Q3） |

---

## 1. 設計上の重要な判断

### 1.1 モデル指定は frontmatter に書かない（config 単一情報源を守る）

subagent の frontmatter に `model: haiku` と書くと、`harness.config.json` の `agents.*.model` と**二重定義**になり、基本ハーネスの受け入れ基準「config と重複するハードコード値が無い」に反する。

採用する方式:

1. agent の frontmatter は `model` を **書かない**（= `inherit`）
2. 呼び出し側（`/review` などのコマンド）が config を読み、**Agent ツールの `model` パラメータ**で渡す。コマンド本文に `` !`node scripts/agents/model-for.mjs verifier-spec` `` を埋め込み、実行時に config から解決する
3. **PreToolUse hook が検証する**: `Agent` 呼び出しの `tool_input.subagent_type` が harness 管理の役割なら、`tool_input.model` が config の値と一致しない場合 deny する

これで単一情報源が保たれ、かつ「モデルを勝手に上げる」ことが機械的に防げる。

### 1.2 `/review` は fork をやめて主コンテキストから 3 並列で呼ぶ

現行 `/review` は `context: fork` + `agent: reviewer` で **1 体**。3 verifier を並列に走らせるには fork をやめ、主コンテキストが 1 メッセージ内で `Agent` を 3 回呼ぶ形にする。

- 各 verifier のコンテキストは独立のまま（隔離は保たれる）
- 主コンテキストに入るのは **各 verifier の返り値（構造化 JSON）だけ**
- マージは主コンテキストが JSON を `.harness/review/*.json` に書き、`node scripts/review/merge-findings.mjs` を実行して**決定的**に行う（LLM を使わない）

### 1.3 CI は matrix 3 ジョブ（モデルに subagent 生成を任せない）

CI では「Claude が 3 体の subagent を正しく並列起動する」ことに依存させたくない。`claude-review.yml` を **3 ジョブの matrix**（`verifier-spec` / `verifier-test` / `verifier-security`）+ `merge` ジョブに変える。各ジョブは `--agent <name>` と `--json-schema` で構造化出力を得る。マージジョブが同じ `merge-findings.mjs` を使う。

- ジョブが並列なので実時間は 1 体のときとほぼ同じ
- 1 体が失敗しても他の結果は残り、merge ジョブが「この観点は未実行」と明記する

### 1.4 上限の強制は PreToolUse(Agent) + 状態ファイル

`SubagentStart` はブロックできないため、`PreToolUse` matcher `Agent` で以下を判定する。

| 判定 | 方法 |
| --- | --- |
| `maxDepth` | hook 入力に `agent_id` があれば「subagent の中」。`.harness/state/agents.json` に `agent_id → depth` を記録し、`親の depth + 1 > maxDepth` なら deny |
| `maxParallel` | PreToolUse で**スロットを予約**（カウンタ +1）、`SubagentStop` で解放（-1）。予約時点で `>= maxParallel` なら deny。10 分を超えた予約は棚卸しで破棄（クラッシュ対策） |

加えて、`settings.json` の `env` に `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` / `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` は **書かない**（config と二重になるため）。ランタイム既定の 20 / 3 より config の値が厳しい前提で、hook を唯一の強制点にする。

ブロック時は `.harness/blocked.jsonl` に 1 行追記する。ワークフローは Claude ステップの後にこのファイルを読み、`notify-slack.yml` を `event: blocked` で呼ぶ（hook から直接 Slack に送らない = 送信経路を GitHub Actions に一本化する既存方針を維持）。

### 1.5 Best-of-N は「選定」を決定的に、「発動」を状態ファイルで

- 発動条件の記録: `Stop` hook がテスト失敗のたびに `.harness/state/attempts.json` の `testFailStreak` を +1、成功で 0 に。`/review` が Blocking を残したまま終わるたび `blockingRetries` を +1
- 発動: `/implement` の冒頭で `node scripts/bestofn/should-run.mjs` を実行（決定的）。`testFailStreak >= 2` または `blockingRetries >= 2` のとき N=`budget.bestOfN`
- 実行: `/implement` が `Agent(subagent_type: implementer, isolation: "worktree")` を N 体並列で起動（各試行は独立 worktree）
- 選定: `node scripts/bestofn/select.mjs <worktree...>` が各 worktree で `commands.test` を実行し、**テスト通過数 → 同点なら差分行数の小ささ → 同点ならパス名の辞書順**で決定的に選ぶ。単体テストあり
- 破棄: 選ばれなかった worktree は削除。失敗理由の 1 行要約だけ `verify.report` の payload に載せる
- **常時 N>1 の設定経路は作らない**（`bestOfN` は発動条件を満たしたときにのみ読まれる。設定で常時 ON にするフラグを置かない）

### 1.6 explorer の出力上限は「規約 + 検査」の二段

frontmatter とプロンプトで行数上限を明示し、加えて `SubagentStop` hook（matcher `explorer`）が返り値の行数と「ファイル全文らしさ」を検査する。超過時は exit 2 で終了をブロックし、要約し直させる。判定は決定的（行数、連続する非空行の塊のサイズ、コードフェンス内の行数）。

### 1.7 ウォークスルーは PR 本文をマーカーで囲って冪等に更新

`<!-- harness:walkthrough:start -->` 〜 `<!-- harness:walkthrough:end -->` の間だけを差し替える。人が書いた本文は消さない。`synchronize` イベントでも再生成する。

---

## 2. 追加・変更ファイル一覧

### PR J: エージェントチーム構成

| ファイル | 種別 | 責務 |
| --- | --- | --- |
| `.claude/harness.config.schema.json` | 変更 | `agents`（4 役割 × `model` / `role`）、`budget.maxParallel` / `maxDepth` / `bestOfN` を追加。`agents.*.model` を必須（空文字は不可） |
| `.claude/harness.config.example.json` | 変更 | 推奨値を記入（Q1）。`budget`: `maxParallel: 4`, `maxDepth: 1`, `bestOfN: 3` |
| `.claude/settings.json` | 変更 | `permissions.allow` に `Agent(explorer)` `Agent(verifier-spec)` `Agent(verifier-test)` `Agent(verifier-security)` `Agent(implementer)`。`hooks` に `SubagentStop` を追加。`PreToolUse` の matcher に `Agent` を追加 |
| `.claude/agents/explorer.md` | 新規 | 読み取り専用。質問を受け、**要約 + パス:行のみ**を返す。出力 60 行以内 |
| `.claude/agents/implementer.md` | 新規 | 実装担当。Best-of-N の worktree 試行で使う |
| `.claude/agents/verifier-spec.md` | 新規 | 設計メモとの乖離 / スコープ外 / 未実装 |
| `.claude/agents/verifier-test.md` | 新規 | テストの妥当性 / エッジケース / 「確認できなかったこと」の妥当性 |
| `.claude/agents/verifier-security.md` | 新規 | 入力検証 / シークレット / 権限 / 依存追加 / MCP 返り値の扱い |
| `.claude/hooks/lib.mjs` | 変更 | `.harness/state` の読み書き、`recordBlocked()` を追加 |
| `.claude/hooks/pre-tool-use.mjs` | 変更 | `Agent` 呼び出しの `maxParallel` / `maxDepth` / モデル一致を検査 |
| `.claude/hooks/subagent-stop.mjs` | 新規 | スロット解放 + explorer の出力量検査 |
| `.claude/hooks/stop.mjs` | 変更 | `testFailStreak` の更新 |
| `.claude/hooks/require-config.mjs` | 変更 | `/review` も対象に追加。必須項目に `agents.*.model` を追加 |
| `.claude/commands/review.md` | 変更 | fork をやめ、ゲート → 3 並列 → 決定的マージ |
| `.claude/commands/plan.md` / `.claude/agents/planner.md` | 変更 | 「並列可能 / 逐次」のサブタスク分解を設計メモに含める |
| `.claude/commands/implement.md` | 変更 | Best-of-N の発動判定と worktree 試行 |
| `scripts/agents/model-for.mjs` | 新規 | 役割名 → config のモデルを標準出力（コマンド本文の `!` 注入用） |
| `scripts/review/gate.mjs` | 新規 | lint / typecheck / test が緑かを判定。赤なら verifier を起動させない |
| `scripts/review/merge-findings.mjs` | 新規 | 3 verifier の JSON を決定的にマージ（同一 file:line 統合、Blocking 先頭） |
| `scripts/bestofn/should-run.mjs` | 新規 | 発動条件の判定（決定的） |
| `scripts/bestofn/select.mjs` | 新規 | テスト通過数 → 差分の小ささで勝者を選ぶ（決定的） |
| `tests/harness/agents.test.mjs` | 新規 | 上限ブロック、モデル一致、explorer 出力上限、マージ、Best-of-N 選定 |
| `.gitignore` | 変更 | `.harness/` |
| `CLAUDE.md` | 変更 | explorer への委譲、並列可能の判定基準、モデル階層 |
| `docs/agent-harness/POLICY.md` | 変更 | K-5 の該当項目（役割表、Best-of-N、並列分担を入れない理由） |
| `.github/workflows/claude-review.yml` | 変更 | matrix 3 ジョブ + merge ジョブ |
| `.github/workflows/claude.yml` | 変更 | Claude ステップ後に `.harness/blocked.jsonl` を読んで `blocked` 通知 |

`reviewer.md` は **この PR では消さない**（制約通り、3 verifier マージ後の別 PR で削除）。

### PR K: PR ウォークスルー

| ファイル | 種別 | 責務 |
| --- | --- | --- |
| `scripts/walkthrough/classify.mjs` | 新規 | `git diff --numstat` → グループ（スキーマ / 型 / ロジック / 呼び出し元 / UI / テスト / 設定 / ドキュメント / その他）。分類は拡張子とパスの決定的規則 |
| `scripts/walkthrough/build.mjs` | 新規 | グループ・件数・増減行数・固定の読み順・設計メモ / 検証報告リンク・未確認件数を Markdown 化 |
| `scripts/walkthrough/needs-diagram.mjs` | 新規 | 図の生成条件を静的パターンで判定（外部 API 呼び出し / イベント / 非同期・ジョブ / 認証・認可） |
| `scripts/walkthrough/update-pr-body.mjs` | 新規 | マーカー間を冪等に差し替え（`gh` 経由） |
| `.github/workflows/pr-walkthrough.yml` | 新規 | `pull_request`（opened / synchronize / reopened / ready_for_review）でウォークスルー生成 → PR 本文更新 → 条件を満たせば図を生成 |
| `scripts/notify/build-message.mjs` | 変更 | `pr.opened` にグループ別件数と読み順の先頭 3 グループ（10 行以内は維持） |
| `tests/harness/walkthrough.test.mjs` | 新規 | 分類・読み順・図の条件（該当あり / なし両方）・マーカー冪等性・Slack 10 行 |
| `docs/agent-harness/EXTERNAL_REVIEW.md` | 新規 | 外部レビューツールの位置づけ・第一候補 / 第二候補・導入手順（人が実施） |
| `.coderabbit.yaml.example` | 新規 | 導入する場合の雛形（自前 verifier と役割が被らない設定） |
| `docs/agent-harness/POLICY.md` | 変更 | 外部ツールの位置づけ、図の生成条件と「自動生成・要確認」 |
| `.claude/agents/verifier-spec.md` | 変更 | 図が生成された場合、図と差分の食い違いを Should fix として扱う |

---

## 3. 既存への影響

| 影響 | 内容 | リスク |
| --- | --- | --- |
| `/review` の `context: fork` 廃止 | 主コンテキストに 3 件の要約が入る（現在は fork で 0） | 低。要約のみで全文は入らない |
| `require-config` に `/review` と `agents.*.model` を追加 | 既存 config を持つ利用先は `agents` 未設定で `/plan` `/implement` `/review` が止まる | **破壊的**。POLICY §9 と PR 本文に移行手順を明記（Q6） |
| `claude-review.yml` の matrix 化 | Claude API 呼び出しが 1 → 3 に増える（トークン 3 倍） | 中。verifier は最安モデル、`maxTurns` も別枠にして抑える |
| `PreToolUse` に `Agent` matcher 追加 | すべての subagent 呼び出しに hook が挟まる | 低。判定は状態ファイル読み書きのみ |
| `.harness/` 状態ファイル | 新ディレクトリ。gitignore 対象 | 低 |
| PR 本文の自動更新 | 人が書いた本文はマーカー外なので保持 | 低 |
| 既存 `reviewer.md` | この PR では残す（並存） | なし |

---

## 4. 依存の追加

**なし**（Node 標準 + `git` + `gh` のみ）。mermaid-cli は Q4 の回答次第で、採用する場合も「Slack 画像添付を有効にしたときだけ CI でインストール」とする。

---

## 5. 判断が必要な点（質問）

**Q1. モデル階層の推奨値（example に書く実値）**
Explore で確認できた現行の指定可能値は `opus` / `sonnet` / `haiku` / `fable`。私の推奨は:

| 役割 | 推奨 | 理由 |
| --- | --- | --- |
| `planner` | `opus`（上位） | 設計判断と分解の質が下流すべてに効く。呼び出し回数は少ない |
| `implementer` | `sonnet`（中位） | 逐次・状態あり作業。量が多く上位は割高 |
| `explorer` | `haiku`（最安） | 読んで要約するだけ。呼び出し回数が最多 |
| `verifier` | `haiku`（最安） | 観点が固定で、3 体並列のため単価が効く |

これでよいか。`fable` を使う枠はあるか。

**Q2. Best-of-N のオーケストレーション範囲**
決定的な部分（発動判定 `should-run.mjs`、勝者選定 `select.mjs`）は必ず実装し単体テストを付けます。N 体の試行そのものは `/implement` が `Agent(subagent_type: implementer, isolation: "worktree")` を N 並列で起動する形を想定しています。この範囲でよいか、それとも**選定スクリプトと手順書だけに留め、N 体起動は人が判断して行う**形にするか。

**Q3. 外部 AI レビューツール**
リポジトリ側には設定ファイルも bot コメントも無く、Org は Free プランです。GitHub App の導入状況は私のトークン権限では確認できませんでした。
(a) 「未導入」として進め、CodeRabbit を第一候補・Copilot Code Review を第二候補として `EXTERNAL_REVIEW.md` に手順のみ書く（推奨）
(b) 先に Org 設定を確認してから決める
どちらにしますか。なお Free プラン + private では CodeRabbit 無料枠も Copilot も即利用は難しく、当面は自前 verifier のみで運用する想定です。

**Q4. Mermaid の PNG 化**
GitHub は PR 本文で Mermaid をネイティブ描画するため、**mermaid-cli を入れず、Slack には PR へのリンクだけ**を出すことを推奨します（CI に Chromium 依存を持ち込まない）。これでよいか。

**Q5. `maxParallel` の既定値**
Claude Code のランタイム既定は 20 同時ですが、コストと GitHub Actions の実行時間を考えると `4` を既定にしたい（`/review` の 3 verifier + 予備 1）。これでよいか。

**Q6. 既存利用先への破壊的変更の扱い**
`agents.*.model` を必須にすると、既に `harness.config.json` を作った利用先で `/plan` `/implement` `/review` が止まります。
(a) 必須にする（受け入れ基準どおり）。移行手順を POLICY §9 と PR 本文に書く（推奨）
(b) 未設定なら example の推奨値にフォールバックし、警告だけ出す
どちらにしますか。現状このテンプレート自身は `harness.config.json` を持っていないので、実害が出るのは今後作るプロジェクトだけです。

**Q7. `reviewer.md` の削除タイミング**
制約どおり PR J では残します。削除は (a) PR K の後に別 PR、(b) PR J で `deprecated` と明記だけして削除は後日、のどちらにしますか。

**Q8. 図の生成に使うモデル**
`agents.verifier` と同じ最安モデルを使う指示ですが、シーケンス図の生成は verifier とは別の呼び出しになります。`agents` に 5 つ目の役割（`diagrammer`）を足さず、`agents.verifier.model` を流用する読み方でよいか。

---

## 6. 実装順と検証方針

1. **PR J**: config スキーマ → agents 定義 → hooks（上限・モデル一致・explorer 出力）→ `/review` 3 並列 + マージ → Best-of-N → CI matrix → docs
2. **PR K**: 分類 → ウォークスルー生成 → PR 本文更新 → 図の条件判定 → Slack 拡張 → 外部ツール文書

検証は基本ハーネスと同じく `bash tests/harness/run.sh` を緑にし、加えて実セッション（`claude -p`）で以下を確認する:

- `maxParallel` 超過で `Agent` が deny される
- `maxDepth` により subagent からの `Agent` が deny される
- config と違うモデルを指定した `Agent` 呼び出しが deny される
- lint が赤い状態で `/review` が verifier を起動しない
- 図の条件に該当しない差分で図が生成されない

`claude-code-action` 内での `--agent` 解決と hooks の動作は、この PR 自体の CI で初めて実機確認できるため、結果を PR 本文の「確認できたこと / できなかったこと」に反映する。

---

## 7. 回答済みの決定と、追加で確認したい 2 点（2026-08-25）

| 質問 | 決定 |
| --- | --- |
| Q1 モデル階層 | `planner: opus` / `implementer: sonnet` / `explorer: haiku` / `verifier: haiku`。`fable` は使わない |
| Q3 外部ツール | (a) 未導入として進め、`EXTERNAL_REVIEW.md` に手順のみ書く |
| Q5 `maxParallel` | `4` |
| Q6 破壊的変更 | (a) `agents.*.model` を必須にし、移行手順を書く |
| Q8 図のモデル | `agents.verifier.model` を流用（役割は 4 つのまま） |
| Q4 Slack の図 | **要確認**（下記 7.1） |
| Q2 Best-of-N | **要確認**（下記 7.2） |
| Q7 `reviewer.md` | **要確認**（下記 7.3） |

### 7.1 Q4: Slack に図を出す場合に必要なもの

**Slack は Mermaid をレンダリングしない。** Block Kit にも mrkdwn にも図の記法は無く、画像を出すには **PNG を生成して Slack にアップロードする** しかない。確認した事実:

- Slack の現行アップロード経路は 3 段階（確認済み）:
  1. `files.getUploadURLExternal`（`filename`, `length` → `upload_url`, `file_id`）
  2. `upload_url` へ POST でバイト列を送る
  3. `files.completeUploadExternal`（`files`, `channel_id`, `thread_ts`, `initial_comment`）
  必要スコープは **`files:write`**（既存の Bot Token は `chat:write` のみなので **スコープ追加と再インストールが必要**）
- PNG 生成には `@mermaid-js/mermaid-cli`（v11.16.0）。**`puppeteer` が peerDependency**（`^23 || ^24 || ^25`）で、CI で Chromium をダウンロードする。図を生成する PR でのみ走るので、常時のコスト増ではない

したがって、図を Slack に出す構成は次のようになる:

```
差分が条件に該当 → Mermaid 生成（最安モデル）→ PR 本文に埋め込み（GitHub がネイティブ描画）
                                              └→ mermaid-cli で PNG 化 → files:write で PR スレッドに添付
```

**提案**: `harness.config.json` の `slack` に `attachDiagrams`（真偽値）を追加する。
- `true`: 上記フル構成。`SLACK_BOT_TOKEN` に `files:write` が必要。Chromium は「図を生成した PR の CI」だけでインストール
- `false`: PNG を作らず、Slack には PR へのリンクだけ。Chromium 依存なし

example の既定値をどちらにするか決めたい。**私の推奨は `true`**（見たいという要望に合わせる）。ただし `files:write` が付くまでは PNG 添付が失敗するので、**失敗しても通知全体は落とさず「図は PR を参照」に自動フォールバック**する実装にする。

> 補足: `files.upload`（旧 API）の廃止時期は今回参照したページでは明示されておらず **未確認**。新しい 3 段階フローのみを実装する。

### 7.2 Q2: Best-of-N のオーケストレーション（詳細）

決定的な 2 つの部品はどちらの案でも同じで、必ず実装し単体テストを付ける。

- `scripts/bestofn/should-run.mjs` — `.harness/state/attempts.json` を読み、`testFailStreak >= 2` または `blockingRetries >= 2` で `N=budget.bestOfN`、それ以外は `1` を返す
- `scripts/bestofn/select.mjs` — 各 worktree で `commands.test` を実行し、**① テスト通過数 → ② 差分行数の小ささ → ③ パス名の辞書順** で勝者を返す。同点処理まで決定的

違うのは「N 体の試行を誰が起こすか」で、案は 2 つある。

**案 A: Claude が subagent を N 体起動する**

`/implement` が `Agent(subagent_type: "implementer", isolation: "worktree")` を N 並列で呼ぶ。

- 利点: 追加の実行系が要らない。`maxParallel` の既存カウンタがそのまま効く
- 欠点:
  - **各 subagent の worktree パスを親が知る方法が未確認**。`select.mjs` に渡すパスを取れないと選定できない
  - 勝者の変更を主作業ツリーへ戻す手順（`git -C <worktree> diff` → `git apply`）が必要
  - 「N 体を確実に起動する」ことをモデルの判断に依存する

**案 C: スクリプトが worktree と試行を作る（推奨）**

`/implement` が `node scripts/bestofn/run.mjs` を 1 回呼ぶ。スクリプトが:

1. `git worktree add` で N 個の作業ツリーを作る（パスは `.harness/bestofn/<n>`、自分で管理するので既知）
2. 各ツリーで `claude -p --agent implementer --max-turns <budget>` を **子プロセスとして並列実行**
3. `select.mjs` で勝者を決め、勝者の差分を主ツリーに `git apply`
4. 敗者の worktree を削除し、失敗理由の 1 行要約だけ残す

- 利点: パスも並列数も同点処理も **すべてスクリプト側で決定的**。モデルの挙動に依存しない。`select.mjs` と合わせて単体テストできる
- 欠点・対策:
  - **再帰の危険**（Claude の中から `claude -p` を呼ぶ）→ 環境変数 `HARNESS_BESTOFN_ACTIVE=1` を子に渡し、`run.mjs` は自分がその環境下なら即座に終了する。加えて子セッションでは Stop hook のテスト実行をスキップする（親が `select.mjs` で回すため二重実行を避ける）
  - 並列数 → `N = min(budget.bestOfN, budget.maxParallel)` に丸める
  - 認証 → 子は親と同じ環境変数（`CLAUDE_CODE_OAUTH_TOKEN` または既存ログイン）を継承する

**私の推奨は案 C。** 案 A は魅力的だが、worktree パスの取得という **未確認の前提** の上に選定ロジック全体が乗るため、今回は採らない。案 A に必要な仕組みが確認できたら差し替えられるよう、`run.mjs` の内部だけを入れ替えれば済む構造にする。

どちらで進めるか指定してください（無回答なら C で進めます）。

### 7.3 Q7: `reviewer.md` の削除タイミング（詳細）

現時点で `reviewer.md` に依存しているものは 3 つある。

| 依存元 | PR J 後の状態 |
| --- | --- |
| `.claude/commands/review.md`（`agent: reviewer`） | PR J で 3 verifier 方式に置き換わり、依存が消える |
| `.github/workflows/claude-review.yml`（`--agent reviewer`） | PR J で matrix 化され、依存が消える |
| `evals/cases/003-reviewer-output/case.yaml` | **依存が残る**。プロンプトが「`.claude/agents/reviewer.md` を読み、その形式で」と指定しているため、削除すると eval が壊れる |

つまり削除には eval ケースの張り替え（`verifier-security` に向ける、または 3 ケースに分割する）が伴う。

さらに、**`claude-code-action` 内で `--agent <name>` がプロジェクトの `.claude/agents/` を解決するかは未確認** のままである（`main` にワークフローが載った直後で、実機実行がまだ 1 度もない）。3 verifier 方式が実機で動かなかった場合、`reviewer.md` は**動作実績のある退避先**になる。

**私の推奨は (b)**:

- **PR J**: `reviewer.md` を残す。frontmatter の `description` 冒頭に「非推奨: `verifier-spec` / `verifier-test` / `verifier-security` に分割済み。手動呼び出し専用」と書き、`disable-model-invocation` 相当の扱いにして自動選択されないようにする。ファイル自体は動く状態を保つ
- **PR K の後、別 PR**: 3 verifier が CI で実際に動いたことを確認してから `reviewer.md` を削除し、同じ PR で eval 003 を張り替える

これは制約「3 verifier がマージされた後の別コミットで行う」を満たしつつ、未確認事項が解消するまで退避先を残す形です。(a)（PR K の後に別 PR で削除）との実質的な違いは「PR J で非推奨と明示するかどうか」だけなので、(a) を選ぶ場合はその明示を省くことになります。

### 7.4 最終決定（2026-08-25）

| 質問 | 決定 |
| --- | --- |
| Q4 | **Slack に図は出さない。** ウォークスルーの要約と PR へのリンクだけを投稿する。`slack.attachDiagrams` は追加せず、mermaid-cli / puppeteer / `files:write` スコープはいずれも不要。図は PR 本文のみ（GitHub がネイティブ描画） |
| Q2 | **案 C**（`scripts/bestofn/run.mjs` が worktree と試行を作る） |
| Q7 | **(b)** PR J では `reviewer.md` を非推奨と明記して残し、PR K の後に別 PR で削除 + eval 003 張り替え |

これにより PR K から `mermaid-cli`・`puppeteer`・Slack の `files:write` に関する作業は消え、依存追加は **引き続きゼロ** になる。
