# mf-invoice-mcp-server

[マネーフォワード クラウド請求書 API v3](https://biz.moneyforward.com/support/invoice/guide/api-guide/a03.html) を、Claude などの
MCP クライアントから使えるようにする **MCP サーバー**（TypeScript / stdio）です。npm パッケージ
`@toolchainjp/mf-invoice-mcp-server` として配布します。

リポジトリ直下の [`document.yaml`](document.yaml)（Money Forward Invoice API v3.6.0 の仕様書）から、全 45 操作を MCP ツールとして自動生成しています。

- 参照系 16 ツール: 自社情報、取引先・取引先部署、品目、請求書・請求書の品目、見積書・見積書の品目、送付履歴
- 書き込み系 29 ツール: 上記の作成・更新・削除、入金ステータスの変更、見積書 → 請求書の変換、郵送依頼・キャンセル など
- `MF_READ_ONLY=true` で参照系だけを公開できます（初めて使うときはこちらを推奨）
- `MF_EXCLUDE_TOOLS` で個別のツールを無効化できます（例: 料金が発生しうる郵送依頼を封じる）

ツールの一覧と引数は [docs/tools.md](docs/tools.md) を参照してください。

## クイックスタート

Node.js 22.12 以上が必要です。

### 1. アプリを作成する

マネーフォワード クラウドの「アプリポータル」でアプリを作成し、クライアント ID とクライアントシークレットを控えます。
リダイレクト URI には `http://localhost:8765/callback` を登録します（詳しくは [docs/setup.md](docs/setup.md)）。

### 2. 認可してリフレッシュトークンを保存する

```bash
MF_CLIENT_ID=<クライアントID> MF_CLIENT_SECRET=<クライアントシークレット> npx @toolchainjp/mf-invoice-mcp-server auth
```

ブラウザでマネーフォワード クラウドにログインしてアクセスを許可すると、トークンが
`~/.config/mf-invoice-mcp-server/token.json` に保存されます。以後、アクセストークンは自動で更新されます。

### 3. MCP クライアントに登録する

Claude Code の例:

```bash
claude mcp add mf-invoice -e MF_CLIENT_ID=<クライアントID> -e MF_CLIENT_SECRET=<クライアントシークレット> -e MF_READ_ONLY=true -- npx -y @toolchainjp/mf-invoice-mcp-server
```

Claude Desktop など JSON で設定するクライアントの例、Docker での起動、アクセストークンだけで使う方法は [docs/setup.md](docs/setup.md) にまとめています。

## 設定（環境変数）

| 変数                   | 既定値                                         | 説明                                                                        |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| `MF_CLIENT_ID`         | —                                              | アプリのクライアント ID                                                     |
| `MF_CLIENT_SECRET`     | —                                              | アプリのクライアントシークレット                                            |
| `MF_REFRESH_TOKEN`     | —                                              | リフレッシュトークン。`auth` でトークンファイルに保存した場合は不要         |
| `MF_ACCESS_TOKEN`      | —                                              | 取得済みのアクセストークン（自動更新しない簡易方式。有効 1 時間）           |
| `MF_TOKEN_FILE`        | `~/.config/mf-invoice-mcp-server/token.json`   | トークンの保存先。`none` で保存しない（`XDG_CONFIG_HOME` があればその下）   |
| `MF_TOKEN_AUTH_METHOD` | `client_secret_basic`                          | トークンエンドポイントでのクライアント認証方式（`client_secret_post` も可） |
| `MF_READ_ONLY`         | `false`                                        | `true` なら参照系のツールだけを公開する                                     |
| `MF_EXCLUDE_TOOLS`     | —                                              | 公開しないツール名（カンマ区切り）。存在しない名前を書くと起動しない        |
| `MF_REDIRECT_URI`      | `http://localhost:8765/callback`               | `auth` の受け口。アプリポータルに登録した値と完全に一致させる               |
| `MF_SCOPES`            | `mfc/invoice/data.read mfc/invoice/data.write` | `auth` で要求するスコープ。参照だけなら `mfc/invoice/data.read`             |
| `MF_TIMEOUT_MS`        | `30000`                                        | API 呼び出しのタイムアウト（ミリ秒）                                        |
| `MF_API_BASE_URL`      | `https://invoice.moneyforward.com/api/v3`      | API のベース URL（テスト用）                                                |
| `MF_TOKEN_URL`         | `https://api.biz.moneyforward.com/token`       | トークンエンドポイント（テスト用）                                          |
| `MF_AUTHORIZE_URL`     | `https://api.biz.moneyforward.com/authorize`   | 認可エンドポイント（テスト用）                                              |

認証方式は「クライアント ID・シークレット + リフレッシュトークン（環境変数またはトークンファイル）」を優先し、
そろわなければ `MF_ACCESS_TOKEN` を使います。どちらも無くてもサーバーは起動し、ツールを呼んだ時点で設定方法を案内するエラーを返します。

## 安全のための仕組み

- 書き込み系ツールには MCP の注記（`destructiveHint` など）と「データを変更します」の注意書きが付きます。クライアントは実行前に確認を求められます。
- 郵送依頼（`post_billings_billing_id_posting` / `post_quotes_quote_id_posting`）は料金が発生しうるため、説明に明記しています。
  使わない場合は `MF_EXCLUDE_TOOLS=post_billings_billing_id_posting,post_quotes_quote_id_posting` で無効化してください。
- 入力は仕様書のスキーマで検証し、不正なら API を呼ばずにエラーを返します。

## 開発

Node.js 24 を前提にしています。端末に Node.js を入れない場合は、[`compose.yaml`](compose.yaml) の `dev` コンテナで同じコマンドを実行します。

```bash
docker compose run --rm dev npm ci
```

```bash
docker compose run --rm dev npm run check
```

| コマンド                | 内容                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| `npm run build`         | `dist/` にビルド                                                  |
| `npm run generate`      | `document.yaml` から `src/generated/` と `docs/tools.md` を再生成 |
| `npm test`              | ユニットテスト                                                    |
| `npm run test:e2e`      | E2E テスト（ビルド → stdio 起動 → 模擬 API）                      |
| `npm run test:all`      | ユニット + E2E                                                    |
| `npm run test:e2e:live` | 実 API に対するライブ E2E（参照系のみ・要認証情報）               |
| `npm run check`         | format チェック・lint・型チェック・全テスト                       |

テストの考え方と実行方法は [docs/testing.md](docs/testing.md)、内部構成は [docs/architecture.md](docs/architecture.md)、
npm への発行手順は [docs/release.md](docs/release.md) を参照してください。

## ドキュメント

| ファイル                                                                                         | 内容                                                 |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| [docs/setup.md](docs/setup.md)                                                                   | アプリの作成、認可、MCP クライアントへの登録         |
| [docs/tools.md](docs/tools.md)                                                                   | ツール一覧と引数（自動生成）                         |
| [docs/testing.md](docs/testing.md)                                                               | テスト戦略と実行方法                                 |
| [docs/architecture.md](docs/architecture.md)                                                     | 内部構成と処理の流れ                                 |
| [docs/release.md](docs/release.md)                                                               | リリースタグによる npm 発行                          |
| [docs/plans/2026-10-04-mf-invoice-mcp-server.md](docs/plans/2026-10-04-mf-invoice-mcp-server.md) | 初回実装の設計メモ                                   |
| [docs/agent-harness/GUIDE.ja.md](docs/agent-harness/GUIDE.ja.md)                                 | エージェント運用ハーネスの使い方（テンプレート由来） |

## 開発フローとテンプレート

このリポジトリは [`toolchainjp/template`](https://github.com/toolchainjp/template) から作成しています。

- ブランチ: `main`（常にリリース可能・PR のみ）／`development`（統合ブランチ）／`feature/*` `fix/*`（作業ブランチ）。PR は `development` 向けに作ります。
- リリース: `development` → `main` の PR をマージし、`main` に `v*.*.*` タグを push すると npm に発行されます（[docs/release.md](docs/release.md)）。
- Claude Code での作業ルールは [CLAUDE.md](CLAUDE.md)、運用ポリシーは [docs/agent-harness/POLICY.md](docs/agent-harness/POLICY.md) にあります。
- `@claude` を Issue / PR で使うには、リポジトリに `CLAUDE_CODE_OAUTH_TOKEN` シークレットの登録が必要です（`scripts/bootstrap-secrets.sh`）。

### 初回セットアップで人が行うこと

`.github/workflows/` と `.claude/` は Claude Code から編集できない保護パスのため、用意した案を手でコピーします。

1. **発行ワークフローの配置**:

   ```bash
   cp docs/release/release.yml .github/workflows/release.yml
   ```

2. **ハーネス設定の配置**（CI の format / lint / typecheck / test はこのファイルがあるときだけ動きます）:

   ```bash
   cp docs/agent-harness/harness.config.proposed.json .claude/harness.config.json
   ```

   コピー後、`$schema` を `"./harness.config.schema.json"` に書き換えてください。

3. **GitHub リポジトリの作成と push**（リモートは未設定です）。`main` と `development` の両方を push し、ブランチ保護を設定します。
4. **npm の準備**: [docs/release.md](docs/release.md) の「初回だけ行うこと」（npm 組織、Trusted Publishing または `NPM_TOKEN`）。
5. **テンプレートの hook は端末の `node` を使います**。Node.js を入れない運用ではローカルの hook は動作しません（CI では動作します）。

## ライセンス

[MIT](LICENSE)
