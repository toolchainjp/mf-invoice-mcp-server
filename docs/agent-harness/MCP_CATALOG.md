# MCP カタログ

MCP（Model Context Protocol）サーバーは Claude Code に外部ツールを追加します。ツールが増えることは権限が増えることなので、**追加は人が行い、Claude Code は提案だけ** を行います（Tier 3 と同じ扱い）。

テンプレートの `.mcp.json` は空（`{"mcpServers": {}}`）です。`.mcp.json` は `protectedPaths` に含まれており、Claude Code は読めますが編集できません。

## カタログ外のサーバーを追加する手順（セキュリティレビュー）

カタログに無いサーバーは、以下を確認してカタログに追記してからでないと、Claude Code の提案対象にも `.mcp.json` にも入れられません。

1. **送信先**: どのデータ（コード、Issue 本文、DB レコード、環境変数）が、どのホストに送られるか。第三者 SaaS なら利用規約・データ保持ポリシーを確認する
2. **認証**: トークンの発行元、スコープ（最小権限か）、失効方法。値は `${ENV_VAR}` 参照で書き、`.mcp.json` に実値を置かない
3. **与える権限**: 読み取り専用か、書き込み・削除・課金・公開があるか。書き込み系ツールは `permissions.deny` で個別に閉じられるか
4. **メンテナとライセンス**: 公式（提供元）か、コミュニティ製か。最終更新、脆弱性報告の窓口、ライセンスの商用利用可否
5. **本番との距離**: 本番環境に到達しうるか。到達しうるなら `deploy.productionPatterns` と `permissions.deny` で遮断できることを確認する
6. **試験**: ローカルで有効化し、`claude mcp list` で接続を確認。ツール一覧を読み、想定外のツールが無いか見る

確認結果を下の表の形式で追記する PR を出し、承認者がレビューします。

## 有効化の手順（利用先プロジェクト）

1. `.mcp.json` に追記（人が PR で行う）:
   ```json
   { "mcpServers": { "<name>": { "type": "stdio", "command": "npx", "args": ["-y", "<package>"], "env": { "TOKEN": "${<ENV_NAME>}" } } } }
   ```
2. `.claude/harness.config.json` の `mcp.servers` に `<name>` を、`mcp.envRefs.<name>` に環境変数名（値ではない）を追加
3. `.claude/settings.json` の `permissions.allow` に `mcp__<name>__*`（または必要なツールだけ `mcp__<name>__<tool>`）を追加し、`enabledMcpjsonServers` に `<name>` を追加。`deny` の `mcp__*` はそのまま残す（deny が allow より強いため、**`mcp__*` の deny を個別 deny の列挙に置き換える**必要がある。例: `mcp__*` → 標準セット以外のサーバー名を列挙）
4. 環境変数: ローカルはシェル、GitHub Actions はシークレットとして `claude.yml` の該当ステップに `env:` で渡す
5. `claude mcp list` で状態を確認。非対話環境（claude-code-action）では `.mcp.json` のサーバーは承認プロンプトなしでロードされる。除外したいサーバーは `disabledMcpjsonServers` に書く

## 承認済みカタログ

「承認済み」はセキュリティレビューを経て利用してよいことを意味し、有効化されていることは意味しません。有効化は利用先プロジェクトごとに判断します。

| 名前 | 用途 | 与える権限 | 送信先 | 認証 | 備考 |
| --- | --- | --- | --- | --- | --- |
| （なし） | | | | | |

### 検討候補（未レビュー。上の手順を経てから表に移す）

| 候補 | 想定用途 | 論点 |
| --- | --- | --- |
| GitHub 公式 MCP | Issue / PR の読み書き | claude-code-action と `gh` CLI で同じことができるため **重複**。標準セットには入れない |
| Context7 等のライブラリドキュメント参照 | 依存ライブラリの最新ドキュメントを引く | クエリ（ライブラリ名・質問文）が第三者 SaaS に送られる。コード自体は送られないが要確認 |
| Playwright MCP | Verify で E2E を回す | ローカルブラウザ操作。任意 URL に到達できるため、`productionPatterns` での遮断と `WebFetch` の許可ドメインとの整合が要る |
| PostgreSQL 読み取り専用 | 開発 DB のスキーマ・データ確認 | 接続先が本番でないことを接続文字列レベルで保証する。読み取り専用ロールを使う |
| Figma MCP | デザイン参照 | プロジェクト依存。読み取りのみのトークンで |

Claude Code は設計メモの `## MCP` 節、またはエスカレーションで「このタスクには X が必要」と **提案のみ** 行います。
