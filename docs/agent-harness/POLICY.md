# エージェント運用ポリシー（POLICY）

このリポジトリを初めて引き継ぐ人向けの文書です。前提知識は「Git と GitHub Actions の基本」だけを想定しています。

> 仕組みの全体像を図で見たい場合は [GUIDE.ja.md](GUIDE.ja.md)（English: [GUIDE.md](GUIDE.md)）から読んでください。
> この文書はルールの正本で、GUIDE はそれらがどう噛み合うかの地図です。

## 0. 3 行で

1. Claude Code（Anthropic のコーディングエージェント）が、Issue から設計メモ → 実装 → PR までを自動で進めます。
2. 人が判断するのは **設計メモの承認（前）と PR の承認（後）の 2 点** だけです。その間は止まりません。
3. 何を自動でやってよいかは **事前にポリシーとして定義**されており（この文書と `.claude/settings.json`）、ポリシー外の操作は機械的にブロックされて人に回ります。

顧客向けプロジェクトでも自社向けプロジェクトでも **基準は同じ**です。プロジェクトごとに変わるのは、承認者・デプロイ先・予算上限といった **事実** だけで、それは `.claude/harness.config.json` の 1 ファイルに書きます。「顧客用モード」「社内用プロファイル」のような分岐は存在しませんし、追加してはいけません（CI が検出します）。

## 1. 用語

| 用語 | 意味 |
| --- | --- |
| Claude Code | ターミナル / GitHub Actions 上で動くコーディングエージェント。`claude` コマンド |
| claude-code-action | GitHub Actions 上で Claude Code を起動する公式アクション。`@claude` メンションで動く |
| hook | Claude Code がツールを使う前後・終了時に自動実行されるスクリプト。`.claude/hooks/` |
| Tier | 操作の危険度区分（§2）。Tier 1・2 は自動、Tier 3 は人が行う |
| 設計メモ | 実装前に書く計画書。`docs/plans/`。承認されるまで実装は始まらない |
| サブエージェント | 独立したコンテキストで動く Claude。`.claude/agents/`。レビュアー・プランナーがこれ |
| eval | 「この入力にはこう振る舞ってほしい」を検査する自動テスト。`evals/` |

## 2. 権限 Tier

判断基準は **可逆性** と **外部への副作用** の 2 軸です。元に戻せて、リポジトリの外に影響しない操作ほど自動化します。

| Tier | 扱い | 内容 | 根拠 |
| --- | --- | --- | --- |
| **1** | 自動許可 | ファイル読み取り、リポジトリ内の編集、format / lint / typecheck / test の実行、`git add / commit / branch / switch / diff / log / stash` | すべて Git で戻せる。外部に出ない |
| **2** | 自動許可 | 依存インストール（`npm ci`、`pip install`、`uv`）、ビルド、ローカル起動、パッケージレジストリ（npm / PyPI）と GitHub への取得 | 副作用は作業環境内。レジストリからの取得は読み取り |
| **要確認** | 人に聞く | `git push`、`gh pr create / merge / comment`、`git reset --hard`、`git rebase`、`git clean` | 共有物に影響する、または元に戻しにくい |
| **3** | 拒否 → 人が行う | `git push --force`、`rm -rf`、`sudo`、`curl` / `wget`、デプロイコマンド（`wrangler deploy`、`terraform apply` 等）、`npm publish`、`.github/workflows/**` / `.claude/**` / `.mcp.json` の編集（`protectedPaths`。読むのは可）、`.env*` / `**/secrets/**` / 鍵ファイルの読み書き（`secretPaths`）、本番環境（`deploy.productionPatterns`）への接続、シークレット環境変数の出力、MCP ツール全般（標準セット以外） | 不可逆、または外部・本番・権限そのものに影響する |

実装箇所:
- 許可 / 確認 / 拒否のルール: `.claude/settings.json` の `permissions.allow / ask / deny`
- コマンドの中身まで見る検査（`rm -rf`、force push、本番 URL、保護パスへの `cat` や `>` など）: `.claude/hooks/pre-tool-use.mjs`
- 書き込み禁止パス（`protectedPaths`。読み取りは可）、読み書き禁止パス（`secretPaths`）、本番パターン（`deploy.productionPatterns`）: `.claude/harness.config.json`
- `--dangerously-skip-permissions`（全許可モード）は `disableBypassPermissionsMode: "disable"` で無効化

Tier 3 をブロックしたとき、hook は「なぜブロックしたか」と「代わりに人に確認せよ」を Claude に返します。黙って失敗させることはありません。

### サンドボックス（任意の追加防御）

上の仕組みはコマンド文字列を見て判断します。OS レベルの隔離を加えたい場合は Claude Code のサンドボックスを有効にできます。

1. Linux / WSL2: `bubblewrap` と `socat` をインストール（macOS は不要）
2. `.claude/settings.local.json`（個人設定。コミットしない）に以下を追加:
   ```json
   { "sandbox": { "enabled": true, "network": { "allowedDomains": ["registry.npmjs.org", "pypi.org", "files.pythonhosted.org", "github.com"] } } }
   ```
3. `/sandbox` で状態を確認

GitHub Actions のランナーでサンドボックスが動くかは **未確認** です。テンプレートは無効のまま出荷しています。

## 3. Human-in-the-loop の 2 つのゲート

```
Issue ──▶ [設計メモ] ──承認──▶ 実装 → 検証 → 独立レビュー ──▶ [PR] ──承認──▶ マージ → デプロイ
             ▲ ゲート 1                                          ▲ ゲート 2
```

- **ゲート 1: 設計メモ承認**。`/plan`（ローカル）または Issue に `plan` ラベル（GitHub）で設計メモが出ます。承認者（`harness.config.json` の `approvers`）が GitHub 上でコメントして承認するまで、実装は始まりません。
- **ゲート 2: PR 承認**。実装・検証・独立レビューが終わった PR を人がレビューしてマージします。
- **その間は止めない理由**: ステップごとに承認を挟むと、承認が形骸化し（毎回「OK」を押すだけになる）、待ち時間だけが増えます。代わりに、決定的なチェック（テスト・型・lint・スキーマ・シークレット検査）を **hook と CI で機械的に強制** し、エージェントの自己申告に頼らない構造にしています。人の注意は「何を作るか（設計）」と「本当にそれができたか（PR）」に集中させます。

hook が強制するもの:

| タイミング | 内容 | 失敗時 |
| --- | --- | --- |
| ファイル編集の直後（PostToolUse） | `commands.format → lint → typecheck` をそのファイルに実行 | 結果をそのまま Claude に返し、修正させる |
| ターン終了時（Stop） | `commands.test` を実行。差分にシークレットらしき文字列が無いか検査 | 終了を止める（失敗したまま「完了」と報告できない） |
| `/plan` `/implement` `/review` 実行時 | `harness.config.json` の必須項目が埋まっているか | 実行を止めて設定を要求 |
| subagent の起動時（PreToolUse） | `budget.maxParallel` / `budget.maxDepth` / `agents.*.model` | 起動を拒否し、理由を返して `blocked` を記録 |
| explorer の終了時（SubagentStop） | 出力が 60 行以内で、ファイル本文の貼り付けが無いか | 終了を止め、要約し直させる |

## 3.5 エージェントチーム構成

役割ごとにモデル階層を分けています。**エージェントを増やすことが目的ではなく**、探索と検証を安いモデルの隔離コンテキストに寄せて、
コストと「主コンテキストが読んだファイルで埋まる」問題を同時に下げるための構成です。

| 役割 | 階層 | なぜその階層か |
| --- | --- | --- |
| `planner` | **上位** | 設計判断とタスク分解の質が下流のすべてに効きます。呼び出し回数は 1 タスクにつき 1〜2 回で、単価が総額に響きません |
| `implementer` | **中位** | 逐次で状態を持つ作業。出力量が最も多いので上位は割高ですが、最安では設計の意図を取り違えます |
| `explorer` | **最安** | 「読んで要約する」だけの定型作業で、呼び出し回数が最多。返すのは要約と `パス:行` だけなので判断の余地が小さい |
| `verifier`（3 体） | **最安** | 観点が固定され、出力形式も決まっています。3 体が並列に走るので単価が 3 倍に効きます |

具体的なモデル名は `.claude/harness.config.json` の `agents` に書きます。**agent 定義ファイル（`.claude/agents/*.md`）には
モデルを書きません。** 二重定義を避けるためで、呼び出し側が設定から解決した値を `Agent` の `model` パラメータで渡し、
PreToolUse hook が設定と違う値を拒否します（「気づいたら上位モデルで回っていた」が起きない）。

同時実行数は `budget.maxParallel`、入れ子の深さは `budget.maxDepth`（既定 1 = subagent はさらに subagent を呼べない）。
どちらも PreToolUse hook が強制し、超過は `.harness/blocked.jsonl` に記録され、ワークフローが `blocked` として Slack に流します。
Claude Code のランタイム既定（同時 20 / 深さ 3）より厳しい値を設定で持ち、hook を唯一の強制点にしています。

### レビューは観点で分ける

1 体のレビュアーに「設計・テスト・セキュリティを全部見て」と頼むと、どれかが薄くなります。3 体に分け、それぞれが
自分の観点だけを見ます。結果のマージは `scripts/review/merge-findings.mjs` が**決定的に**行います（順序は Blocking →
Should fix → Nit、同じファイル・行の指摘は 1 件に統合、結果を返さなかった観点は「未検証」と明記）。**マージに LLM を使いません** —
使うと「まとめ方」が実行のたびに変わり、レビュー結果を比較できなくなるためです。

`/review` は決定的チェック（lint / typecheck / test）が緑のときだけ verifier を起動します。機械が拾える誤りが残っている
うちのレビューはノイズになり、レビュアーの指摘の信頼度も下がるためです。

### Best-of-N（行き詰まったときだけ）

同じ実装を N 回独立に試し、いちばん良いものを採る手法です。**常に N>1 にする設定は用意していません。** 常時 N 倍のコストを
払っても、うまくいっているときの成果はほとんど変わらないためです。次のどちらかを満たしたときだけ発動します。

- テストが **2 ターン連続** で失敗した
- Blocking 指摘が **2 回の修正後も** 残っている

発動すると `scripts/bestofn/run.mjs` が独立した git worktree を N 個作り、各所で試行を走らせ、
**① テスト通過数 → ② 差分の小ささ → ③ パス名の辞書順** で勝者を決めます。**選定に LLM を使いません。**
選ばれなかった試行は破棄し、失敗理由の 1 行要約だけが検証報告に残ります。

### 実装の並列分担を入れていない理由

複数の implementer に別々のファイルを担当させることは **していません**。理由は 3 つです。

1. 実装は逐次で状態を持つ作業で、片方の型定義の変更がもう片方の前提を壊します
2. 衝突を解決する仕組み（マージ、再試行、どちらを採るかの判断）が必要になり、その判断こそ自動化しにくい部分です
3. 得られるのは実時間の短縮だけで、品質は上がりません。今のボトルネックはレビューと承認であって実装速度ではありません

導入するとしたら、`/plan` の `## サブタスク` が「並列可能」と判定した単位に限り、かつ次を満たすときです:
触るファイル集合が互いに素、共有状態（DB スキーマ・共通の型・設定）を変更しない、一方の出力が他方の入力でない、
テストが互いに干渉しない。`/plan` はこの区別を今も設計メモに書いているので、判断材料は残ります。

## 3.6 PR ウォークスルーと図

人のレビュー時間を減らすため、PR を「差分の平坦なリスト」ではなく「**変更のグループと読み順**」で見せます。
`scripts/walkthrough/` が PR 作成・更新のたびに生成し、PR 本文の先頭に
`<!-- harness:walkthrough:start -->` 〜 `end` のマーカーで囲んで差し込みます。マーカーの外にある
人が書いた本文は消えません。

読み順は固定です: **スキーマ → 型 → ロジック → 呼び出し元 → UI → テスト → 設定 → ドキュメント**。
前提が先に来るので、上から読めば途中で戻らずに済みます。**分類も順序も LLM を使いません** — 使うと
実行のたびに並びが変わり、「前回と同じ見え方」が保証できなくなるためです。

### 図は相互作用が変わったときだけ

シーケンス図を作るのは、差分が次のどれかに触れたときだけです。判定はパスと追加行の静的パターンで
**決定的に**行います（`scripts/walkthrough/needs-diagram.mjs`）。

- 外部 API 呼び出しの追加・変更
- イベント発火・購読の変更
- 非同期処理・ジョブの追加・変更
- 認証・認可フローの変更

条件を満たしたときだけ、`agents.verifier` と同じ最安モデルで Mermaid のシーケンス図（変更前 / 変更後）を
生成します。それ以外の変更に図は付きません。図が無いこと自体が「相互作用は変わっていない」という情報です。

生成された図には必ず **「自動生成・要確認」** のラベルが付きます。図はモデルが差分から起こした推測であって
実装の正本ではないため、`verifier-spec` が図と差分の食い違いを確認し、食い違いは **Should fix** として
報告します。GitHub は PR 本文の Mermaid をそのまま描画するので、追加のツールは要りません。

**Slack には図を送りません。** Slack は Mermaid を描画できず、画像にするには CI に Chromium を持ち込み、
Bot Token に `files:write` を足す必要があります。通知にはウォークスルーの要約（グループ別件数と読み順の
先頭 3 グループ）と PR へのリンクだけを載せ、図は PR で見てもらいます。

### 外部レビューツールは推奨であって必須ではない

外部の AI レビューツール（CodeRabbit、Copilot Code Review など）は **任意** です。契約が無くても
ハーネスは完全に動きます。導入する場合の役割分担は次のとおりで、詳しい手順は
`docs/agent-harness/EXTERNAL_REVIEW.md` にあります。

- **外部ツール**: 何を変えたか（変更の要約、一般的な不具合パターン）
- **自前の verifier**: 設計メモどおりか、何が未検証か
- **ウォークスルー**: どの順に読むか

同じ指摘が二重に出ないよう、verifier の定義には「変更内容の要約はしない」と明記してあります。
導入・課金・Organization 設定は人が行い、エージェントは提案までです。

## 4. エスカレーションの流れ

エージェントは次のとき作業を止めて質問します（`CLAUDE.md` §3）: 指示と既存コードの矛盾、外部への副作用、設計メモに無い変更、環境要因でテスト不可、hook によるブロック、MCP の追加が必要。

```
エージェントが質問 ──▶ Slack「escalation」通知（承認者にメンション）
        │
        ▼
人が GitHub 上で回答（Issue / PR のスレッド。Slack では受け付けない）
        │
        ▼
回答を蓄積する: /absorb <回答> ──▶ evals/ のケース追加 ／ CLAUDE.md 追記 ／ hook の deny 追加
```

同じ質問が二度来ないように、回答は必ずどれかに落とします。どこに落としたかは PR の説明に書きます。

## 5. 高頻度出力のサンプリングレビュー

自動で流れる出力（設計メモ、PR、レビューコメント、Slack 通知）を全件人が読むのは現実的ではありません。次の 2 系統で抽出して読みます。

- **低信頼度の抽出**: 未確認項目がある検証報告、Blocking 指摘のある PR、`blocked` 通知、eval の失敗。Slack 通知は悪い知らせを先頭に置く設計なので、これらは目に入ります。
- **ランダム抽出**: 週に 1 度、直近のマージ済み PR から 2〜3 件を無作為に選び、設計メモ・差分・レビュー・検証報告を通しで読みます。目的は「機械的チェックが見逃しているパターン」を見つけることで、見つけたものは `/absorb` で蓄積します。

## 6. kill switch と予算

| やりたいこと | 操作 |
| --- | --- |
| 今動いているジョブを止める | GitHub → Actions → 該当 run → **Cancel workflow** |
| 以後の自動起動を止める | GitHub → Actions → `Claude Code` / `Claude Review` ワークフロー → **Disable workflow** |
| ターン数・時間の上限を下げる | `harness.config.json` の `budget.maxTurns` / `budget.maxMinutes` を変更して PR。緊急時はリポジトリ変数 `HARNESS_MAX_TURNS` / `HARNESS_MAX_MINUTES` を設定（config より優先。`HARNESS_MAX_TURNS=1` で実質停止） |
| 並列 subagent を止める | `budget.maxParallel` を `1` にする。`/review` は 3 体を順に起動しようとして 2 体目で hook に拒否されるため、実質レビューが止まります |
| Best-of-N を止める | `budget.bestOfN` を `1` にする |
| モデル階層を下げる（コスト削減） | `agents.*.model` を変更して PR。agent 定義ファイル側にモデルは書かれていないので、ここだけ直せば全経路に効きます |
| 認証を無効化する | Org / リポジトリのシークレット `CLAUDE_CODE_OAUTH_TOKEN` を削除またはローテーション |
| Slack 通知だけ止める | `harness.config.json` の `slack.channel` を空にする、または `slack.events.<name>` を `false` |

予算はサブスクリプション（OAuth トークン）前提のため、金額上限ではなく **ターン数と実行時間** で制御します。

## 7. 監査ログの見方

| 何を知りたい | どこを見る |
| --- | --- |
| エージェントが何をしたか（ツール呼び出し単位） | GitHub → Actions → 該当 run → `Run Claude Code` ステップのログ。claude-code-action が実行ファイル（`execution_file`）を出力する |
| hook が何をブロックしたか | 同ログ内の `[harness]` で始まる行。ローカルでは `claude --debug hooks` |
| レビュアーの指摘 | PR のコメント「Independent review」 |
| eval の judge がなぜ PASS / FAIL としたか | CI の `eval` ジョブの artifact `eval-results` → `judge-log.jsonl`（判定理由つき） |
| Slack 通知の紐付け | Issue / PR の `<!-- harness-slack-thread: … -->` コメント |
| 設計メモの承認履歴 | `docs/plans/*.md` と、その Issue / PR のコメント |

### OpenTelemetry（任意）

Claude Code はメトリクスとイベントを OTLP でエクスポートできます。**エンドポイントを設定しない限り無効** です。

1. OTLP 対応のコレクタ（Grafana、Datadog、Honeycomb、自前の otel-collector 等）を用意する
2. ローカルの `.claude/settings.local.json` に追加（値は例）:
   ```json
   {
     "env": {
       "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
       "OTEL_METRICS_EXPORTER": "otlp",
       "OTEL_LOGS_EXPORTER": "otlp",
       "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
       "OTEL_EXPORTER_OTLP_ENDPOINT": "https://collector.example.com:4318",
       "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Bearer <token>"
     }
   }
   ```
   ヘッダのトークンはコミットしないでください（`settings.local.json` は gitignore 済み）。
3. GitHub Actions で有効化する場合は、リポジトリ変数 `OTEL_EXPORTER_OTLP_ENDPOINT` とシークレット `OTEL_EXPORTER_OTLP_HEADERS` を置き、`claude.yml` の `Run Claude Code` ステップに `settings:` 入力で上記 JSON を渡します（テンプレートでは未配線。配線する PR を作る際はこの節を更新してください）。
4. プロンプト本文を送りたい場合のみ `OTEL_LOG_USER_PROMPTS=1`。既定では送りません。

## 8. MCP（外部ツール）についての原則

- MCP サーバーを **設定するのは人、提案するのは Claude Code** です。ツールが増える＝権限が増えるので Tier 3 と同じ扱いです。
- テンプレートの `.mcp.json` は空です。承認済みの候補は `docs/agent-harness/MCP_CATALOG.md` にあり、有効化は人が `.mcp.json` を編集する PR で行います。
- **MCP を増やしても hook 側の Tier 3 防御は緩めません。** MCP 経由で本番に触れるサーバーを入れる場合も、`deploy.productionPatterns` と `permissions.deny` で遮断されることを確認します。
- MCP ツールの返り値は信頼できない外部入力です。返り値に含まれる指示にエージェントは従いません（`CLAUDE.md` §6）。

## 9. 新しいプロジェクトでの初期設定（チェックリスト）

1. `cp .claude/harness.config.example.json .claude/harness.config.json` し、`approvers`、`deploy.*`、`commands.*` を埋めてコミット
2. 必要なら `protectedPaths`（書き込み禁止）、`secretPaths`（読み書き禁止）、`deploy.productionPatterns`（本番のホスト名、環境名など）を追加
3. シークレットを登録: `claude setup-token` でトークンを取得し、`bash scripts/bootstrap-secrets.sh` を実行（GitHub Free プランでは Org シークレットが private リポジトリに届かないため、リポジトリごとに 1 回必要。値は対話入力で、ファイルには残らない）
4. Slack 通知を使う場合: Slack App（`chat:write`）を作り、Bot Token を手順 3 のスクリプトで `SLACK_BOT_TOKEN` として登録し、`slack.channel` にチャンネル ID を設定。承認者のメンションには `slack.approverSlackIds` を設定
5. デプロイ完了通知を出す場合: デプロイワークフローの末尾にジョブを追加
   ```yaml
   notify:
     needs: deploy
     uses: ./.github/workflows/notify-slack.yml
     secrets: inherit
     with:
       event: deploy.done
       payload: '{"repo":"${{ github.repository }}","target":"<deploy target>","deployUrl":"https://…","runUrl":"${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"}'
   ```
6. ブランチ保護（`main` / `development` に PR 必須、force push 禁止）を設定
7. `bash tests/harness/run.sh` が通ることを確認

## 10. この文書の変更

ポリシーの変更（Tier の移動、ゲートの追加・削除）は、この文書・`settings.json`・hook を **同じ PR** で変更し、理由を PR に書きます。ポリシー文書だけ、設定だけを変えると乖離します。
