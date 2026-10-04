# 設計メモ: マネーフォワード クラウド請求書 API v3 の MCP サーバー（TypeScript、npm 発行）

- 作成日: 2026-10-04
- ブランチ: `feature/mf-invoice-mcp-server`（`development` から分岐）
- 承認者: @KosukeFujimoto
- 状態: 依頼者のチャット指示（プラン → テスト → 実装 → ユニット / E2E 実行 → 発行ワークフローまで一気通貫）により、承認済みとして実装に進む

## 目的

リポジトリ直下の `document.yaml`（Money Forward Invoice API v3.6.0、OpenAPI 3.1、30 パス・45 操作）を元に、
Claude などの MCP クライアントからクラウド請求書の取引先・品目・請求書・見積書・送付履歴を参照・操作できる
MCP サーバー（stdio）を TypeScript で実装し、npm パッケージとして発行できるようにする。
リリースタグ（`v*.*.*`）の push で npm に発行する GitHub Actions ワークフローを用意する。

構成は同じテンプレートから作った隣のリポジトリ（`../account`、クラウド会計 API の MCP サーバー）と揃える。
運用者が 2 つのリポジトリを同じ手順で扱えるようにするため。

## 仕様書の特徴（Explore の結果）

| 項目           | 内容                                                                                                                                                     | 設計への影響                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 操作数         | 45（`x-mcp.operationKind`: read 16 / create 10 / update 9 / delete 10）                                                                                  | ツールは生成する                                                                           |
| `x-mcp` 拡張   | 全操作に `description` / `useWhen`（/ `doNotUseWhen`）、パラメータに `x-mcp.description`                                                                 | ツール説明・引数説明に優先して使う。本文中の operationId はツール名に置き換える            |
| 認証           | OAuth 2.0 認可コードのみ（`api.biz.moneyforward.com/authorize`, `/token`）。スコープ `mfc/invoice/data.read` / `data.write`。API キー方式の記載なし      | アクセストークン直指定 + リフレッシュトークンによる自動更新 + 初回取得用の `auth` コマンド |
| サーバー       | `servers: /api/v3`（相対）。実体は `https://invoice.moneyforward.com/api/v3`                                                                             | 既定のベース URL をこれにする                                                              |
| 正規表現       | Ruby 形式が混在（`'/^T\d{13}$/'`、`/\A…\z/`、所有量指定子 `*+`）                                                                                         | JS の正規表現へ変換。変換できなければ `pattern` を外す（API 側の検証に任せる）             |
| 課金を伴う操作 | 郵送依頼（`post-*-posting`）は 402 Payment Required を返しうる                                                                                           | 402 を持つ操作の説明に「料金が発生する場合がある」と明記                                   |
| その他         | `nullable`（3.0 形式）が 1 箇所、`x-stoplight`、スキーマ内 `examples`、`application/xml` 応答が 1 箇所。クエリの配列パラメータなし（カンマ区切り文字列） | 変換時に除去・無視                                                                         |

## 方針

### 1. ツール定義は仕様書から生成する

- `scripts/generate-operations.ts` が `document.yaml` を読み、`$ref` を解決した操作定義を `src/generated/operations.ts` に、
  ツール一覧を `docs/tools.md` に書き出す（どちらもコミット）。ユニットテストで生成物と仕様書の一致を検査する。
- スキーマ変換: `$ref` 展開（循環はエラー）、`nullable` を `type` 配列へ、`example(s)` / `x-*` / `xml` などを除去、正規表現を JS 形式へ。

### 2. MCP ツールの形

- ツール名: `operationId` の `-` を `_` に（例: `get-partners-id` → `get_partners_id`）。仕様書の命名をそのまま追えるようにする。
- 入力: パス／クエリパラメータはトップレベル、リクエストボディは `body`。`additionalProperties: false`。
- 説明: `x-mcp.description` → 使う場面 / 使わない場面 → HTTP メソッドとパス → 必要なスコープ → 注意書き（書き込み・課金）。
- 注記（annotations）は `operationKind` から決める:

  | operationKind | readOnlyHint | destructiveHint | idempotentHint |
  | ------------- | ------------ | --------------- | -------------- |
  | read          | true         | false           | true           |
  | create        | false        | false           | false          |
  | update        | false        | true            | true           |
  | delete        | false        | true            | true           |

- 入力は Ajv で検証し、誤り・API エラー・設定不足は `isError: true` のツール結果として日本語で返す（LLM が修正できるように）。
- 公開範囲の制御: `MF_READ_ONLY=true` で read のみ、`MF_EXCLUDE_TOOLS`（カンマ区切り）で個別に非公開（例: 郵送依頼を封じる）。

### 3. 認証

| 方式                         | 環境変数                                               | 動作                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| リフレッシュトークン（推奨） | `MF_CLIENT_ID`, `MF_CLIENT_SECRET`, `MF_REFRESH_TOKEN` | `POST /token`（`grant_type=refresh_token`）でアクセストークンを取得し、期限 5 分前まで再利用。新しいリフレッシュトークンが返れば差し替え、トークンファイルに保存 |
| アクセストークン             | `MF_ACCESS_TOKEN`                                      | そのまま Bearer として送る（有効 1 時間、更新は利用者側）                                                                                                        |
| 初回取得                     | `npx @toolchainjp/mf-invoice-mcp-server auth`          | ローカルで認可コードフローを実行（`http://localhost:8765/callback` で受け取り）→ トークンファイルに保存                                                          |

- トークンファイル: `MF_TOKEN_FILE`（既定 `~/.config/mf-invoice-mcp-server/token.json`、権限 0600）。起動時はファイルのリフレッシュトークンを優先し、
  拒否されたら環境変数の値で 1 回だけやり直す（リフレッシュトークンのローテーションでサーバー再起動後に失効しないように）。
- クライアント認証方式は `MF_TOKEN_AUTH_METHOD`（`client_secret_basic` 既定 / `client_secret_post`）。アプリポータルの設定に合わせる。
- 認証情報が無くてもサーバーは起動してツール一覧は返し、呼び出し時に設定方法を案内する。401 はトークンを破棄して 1 回だけ再試行。

### 4. 構成

```
src/
  index.ts              エントリポイント（stdio）/ `auth` サブコマンドの振り分け
  server.ts             MCP サーバー組み立て（ListTools / CallTool）
  config.ts             環境変数の読み込みと検証
  auth.ts               トークン提供（リフレッシュ + キャッシュ + ファイル保存 / 固定トークン / 未設定）
  oauth-cli.ts          `auth` サブコマンド（認可コードフロー）
  token-store.ts        トークンファイルの読み書き
  client.ts             HTTP クライアント・エラー変換
  tools.ts              操作定義 → MCP ツール、入力検証、実行
  openapi/convert.ts    OpenAPI → 操作定義・JSON Schema 変換（生成スクリプトとテストで共用）
  generated/operations.ts  生成物
scripts/generate-operations.ts
test/unit/  test/e2e/  test/e2e-live/  test/helpers/
```

### 5. パッケージ発行

- パッケージ名 `@toolchainjp/mf-invoice-mcp-server`、`bin: mf-invoice-mcp-server`、`files: dist`、`publishConfig: { access: public, provenance: true }`。
- `.github/workflows/release.yml`: タグ `v*.*.*` の push で起動 →
  タグと `package.json` の version の一致 / タグのコミットが `main` に含まれること / 同じ版が未発行であることを確認 →
  `npm ci` → `npm run check`（format / lint / typecheck / unit / E2E）→ `npm publish --provenance`（`-` を含む版は dist-tag `next`）→
  GitHub Release 作成（既存なら作らない）→ テンプレートの `notify-slack.yml` で `deploy.done` 通知。
- npm 認証は Trusted Publishing（OIDC、シークレット不要）を推奨し、`NPM_TOKEN` シークレットでも動くようにする。
  発行ジョブは Environment `npm` に置き、必要なら承認者を設定できるようにする。
- `.github/workflows/**` はテンプレートのポリシーで Claude Code から編集できない（Tier 3）。ワークフローは
  `docs/release/release.yml` に置き、人が `.github/workflows/` に移す（または承認を得て配置する）。

## 変更するファイル

| ファイル                                                                                             | 責務                                                   |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `package.json` / `package-lock.json`                                                                 | 依存・スクリプト・発行設定                             |
| `tsconfig*.json` / `eslint.config.js` / `.prettierrc.json` / `.prettierignore` / `vitest*.config.ts` | ツール設定（account と同一）                           |
| `Dockerfile` / `compose.yaml` / `.dockerignore` / `.gitattributes` / `.gitignore`                    | Docker での開発・実行、改行コード、無視ファイル        |
| `src/**`                                                                                             | サーバー本体（§4）                                     |
| `scripts/generate-operations.ts`                                                                     | 生成スクリプト                                         |
| `test/**`                                                                                            | ユニット / E2E / ライブ E2E とヘルパー                 |
| `README.md` / `CLAUDE.md`                                                                            | プロジェクト説明と作業ルール（テンプレート記述を更新） |
| `docs/setup.md` / `docs/tools.md` / `docs/architecture.md` / `docs/testing.md` / `docs/release.md`   | 利用者・開発者向けドキュメント                         |
| `docs/release/release.yml`                                                                           | 発行ワークフロー（人が `.github/workflows/` に配置）   |
| `docs/agent-harness/harness.config.proposed.json`                                                    | `harness.config.json` の案（人がコピー）               |

## 変更しないもの

- `document.yaml`（提供元の仕様書。内容は書き換えない）
- `.claude/**`、`.github/workflows/**`、`.mcp.json`（テンプレートのポリシーで Tier 3）
- テンプレート由来のスクリプト・評価・ハーネステスト（`scripts/*/`、`evals/`、`tests/harness/`）

## サブタスク

すべて **逐次**（生成物・共通の型定義・ロックファイルを共有し、テスト → 実装で入出力が依存するため）。

1. 雛形（設定ファイル、依存のインストール）
2. テストを先に書く（ユニット: convert / generated 同期 / tools / client / auth / token-store / config / server、E2E: stdio + 模擬 API、ライブ E2E）→ 失敗を確認
3. 実装（convert → 生成スクリプト → config → token-store → auth → client → tools → server → oauth-cli → index）→ テストを通す
4. ドキュメントと発行ワークフロー
5. `npm run check`（format / lint / typecheck / unit / E2E）、`npm pack --dry-run` で同梱物を確認

## テスト方針

| 種類       | 観点                                                                                                                                                                                                                                                                                                                                                                              | 外部依存                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| ユニット   | Ruby 正規表現の変換（変換後の正規表現で正しい値が通り不正値が落ちる）、45 操作の抽出と operationKind、x-mcp 説明の採用と operationId → ツール名置換、注記、読み取り専用 / 除外、Ajv 検証、URL・ボディ組み立て、エラー変換（402 / 429 / 401 再試行）、リフレッシュ・キャッシュ・同時呼び出し・ローテーション保存・ファイル優先と環境変数へのフォールバック、設定検証、生成物の同期 | なし（fetch モック・一時ディレクトリ） |
| E2E        | `dist/index.js` を stdio で起動 → `initialize` / `tools/list` / `tools/call`。模擬 HTTP サーバー（`/token` と請求書 API）が受けたリクエスト（パス、クエリ、ボディ、Bearer、client_secret_basic）を検証。204、4xx、入力不正時に API を呼ばないこと、読み取り専用モード、トークンファイルへの保存                                                                                   | なし                                   |
| ライブ E2E | 実 API に対し参照系ツール（事業者・取引先・品目・請求書・見積書・送付履歴の一覧）を `MF_READ_ONLY=true` で実行。明示実行のみ                                                                                                                                                                                                                                                      | 認証情報                               |

テストが実装を写すだけにならないよう、期待値は仕様書・HTTP の観点（実際に送られたリクエスト）で書く。

## リスクと影響

- 書き込み系ツールは実データを変更し、郵送依頼は料金が発生しうる。説明文と注記で明示し、`MF_READ_ONLY` / `MF_EXCLUDE_TOOLS` を案内する。
- リフレッシュトークンのローテーション仕様が公開資料で確認できない。保存とフォールバックで両方の挙動に耐えるようにする。
- テンプレートの hook は端末の `node` を前提にしており、Node を入れない運用ではローカルの hook は動かない（CI では動く）。
- 新規リポジトリなので既存動作への影響はない。外部への副作用は発行ワークフロー（npm への公開）だけで、タグを push したときだけ動く。

## 質問

1. パッケージ名 `@toolchainjp/mf-invoice-mcp-server`（npm の `toolchainjp` 組織が必要）でよいか。
2. 発行先は npmjs.com（公開、`npx` で誰でも起動できる）でよいか。GitHub Packages は利用者側にも認証が要るため候補から外した。
3. ライセンスは `UNLICENSED` のまま公開してよいか（公開パッケージなら MIT などを推奨）。→ **MIT に決定**（2026-10-05、依頼者の回答）。
4. GitHub のリポジトリ名を `toolchainjp/mf-invoice-mcp-server` と仮定して `repository` を書いた。provenance はこの URL と実際のリポジトリが一致しないと失敗する。
5. 発行ワークフローの配置（`.github/workflows/` は Tier 3）。

## MCP

不要（実装・テストとも外部 MCP サーバーを使わない）。

## 承認

- [x] 承認者: @KosukeFujimoto（チャットでの依頼により承認済みとして進行）
