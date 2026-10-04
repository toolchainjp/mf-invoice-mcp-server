# テスト

テストは 3 層に分かれています。通常の開発・CI・リリースでは外部サービスに一切アクセスしません。

| 層         | コマンド                | 対象                                                 | 外部依存       |
| ---------- | ----------------------- | ---------------------------------------------------- | -------------- |
| ユニット   | `npm test`              | 各モジュール（`fetch` はモック）                     | なし           |
| E2E        | `npm run test:e2e`      | ビルド済みサーバーを stdio で起動し、模擬 API と通信 | なし           |
| ライブ E2E | `npm run test:e2e:live` | ビルド済みサーバーを実 API に接続（参照系のみ）      | 認証情報が必要 |

`npm run test:all` はユニット + E2E を実行します（CI・発行ワークフロー・ハーネスの `commands.test` はこれを使います）。

## Docker で実行する

端末に Node.js が無い場合は、`compose.yaml` の `dev` コンテナで実行します。`node_modules` はコンテナ側の名前付きボリュームに置かれます。

```bash
docker compose run --rm dev npm ci
```

```bash
docker compose run --rm dev npm run test:all
```

```bash
docker compose run --rm dev npm run check
```

## ユニットテスト（`test/unit/`）

| ファイル              | 主な確認内容                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `convert.test.ts`     | ツール名、Ruby 正規表現の変換（変換後に正しい値が通り不正な値が落ちる）、スキーマ変換、45 操作と operationKind、x-mcp の取り込み          |
| `generated.test.ts`   | `src/generated/operations.ts` と `docs/tools.md` が `document.yaml` と一致しているか（`npm run generate` 忘れ検出）                       |
| `tools.test.ts`       | 説明文（使う場面・スコープ・料金の注意）、注記、入力スキーマ、読み取り専用・除外、入力検証、実行結果とエラーのヒント                      |
| `client.test.ts`      | URL・クエリ・パス・ボディの組み立て、エラー形式の吸収、401 再試行、通信エラー・タイムアウト                                               |
| `auth.test.ts`        | トークン取得（Basic / POST）、キャッシュと期限 5 分前の更新、同時呼び出し、ローテーションと保存、ファイル優先と環境変数へのフォールバック |
| `token-store.test.ts` | トークンファイルの読み書き、権限 0600、壊れたファイル、既定の保存先                                                                       |
| `config.test.ts`      | 環境変数の読み込みと検証                                                                                                                  |
| `oauth-cli.test.ts`   | 認可 URL、コールバックでのコード交換と保存、state 不一致・拒否・交換失敗                                                                  |
| `server.test.ts`      | インメモリ接続した MCP クライアントからの `tools/list` / `tools/call`、バージョンと package.json の一致                                   |

## E2E テスト（`test/e2e/`）

`test/helpers/mock-mf-api.ts` がローカルに HTTP サーバーを立て、トークンエンドポイント（`/token`）とクラウド請求書 API を模倣します。
テストは `dist/index.js` を子プロセスとして起動し（実際の MCP クライアントと同じ stdio 接続）、次を確認します。

- `initialize` / `tools/list`（45 ツール、入力スキーマ、注記）
- リフレッシュトークンによる取得（`client_secret_basic` / `client_secret_post`）、アクセストークンの再利用、トークンファイルへの保存、再起動後の再利用
- クエリ・パス（エンコード）・ボディの送信、204、402 / 429 / 401 のエラー表示、入力不正時に API を呼ばないこと
- 読み取り専用モード、アクセストークンだけでの利用、認証情報なしでの起動
- コマンドライン（`--version`、`--help`、設定エラー、`MF_EXCLUDE_TOOLS` の打ち間違い、`auth` の設定不足）

## ライブ E2E（`test/e2e-live/`）

実際のクラウド請求書 API に接続して、参照系ツールが成功することを確認します。**安全のため `MF_READ_ONLY=true` で起動するので、データは変更しません。**

必要な環境変数: `MF_CLIENT_ID` + `MF_CLIENT_SECRET` + `MF_REFRESH_TOKEN`（またはトークンファイル）、もしくは `MF_ACCESS_TOKEN`。
`.env` に書いておくと、`dev` コンテナが自動で読み込みます（`.env` はコミットされません）。

```bash
docker compose run --rm dev npm run test:e2e:live
```

認証情報が無い場合は、何を設定すべきかを示して失敗します。

## テストを追加するとき

- 仕様書を更新したら `npm run generate` を実行し、生成物と `docs/tools.md` をコミットします。
- 模擬 API に無いエンドポイントを E2E で使う場合は `test/helpers/mock-mf-api.ts` に分岐を追加します。
- テストの skip・無効化・削除はしません（[CLAUDE.md](../CLAUDE.md) §6）。
