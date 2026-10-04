# セットアップ

## 1. アプリを作成する

クラウド請求書 API v3 は OAuth 2.0（認可コードフロー）で認証します。最初に、API を使うためのアプリを作成します。

1. マネーフォワード クラウドの **アプリポータル** にログインし、アプリを新規作成します
   （手順: [クラウド請求書 API v3 スタートアップガイド](https://biz.moneyforward.com/support/invoice/guide/api-guide/a04.html)）。
2. 次のように設定します。

   | 項目                 | 値                                                                                                   |
   | -------------------- | ---------------------------------------------------------------------------------------------------- |
   | リダイレクト URI     | `http://localhost:8765/callback`（変える場合は `MF_REDIRECT_URI` も同じ値にする）                    |
   | スコープ             | `mfc/invoice/data.read`（参照のみ）、書き込みも行うなら `mfc/invoice/data.write` も                  |
   | クライアント認証方式 | `CLIENT_SECRET_BASIC`（`CLIENT_SECRET_POST` にした場合は `MF_TOKEN_AUTH_METHOD=client_secret_post`） |

3. 表示された **クライアント ID** と **クライアントシークレット** を控えます。

## 2. 認可してリフレッシュトークンを取得する

```bash
MF_CLIENT_ID=<クライアントID> MF_CLIENT_SECRET=<クライアントシークレット> npx @toolchainjp/mf-invoice-mcp-server auth
```

1. ローカルで `http://localhost:8765/callback` の待ち受けを始め、ブラウザで認可画面を開きます（開かない場合は表示された URL を開きます）。
2. マネーフォワード クラウドにログインし、事業者を選んでアクセスを許可します。
3. 認可コードをトークンに交換し、`~/.config/mf-invoice-mcp-server/token.json`（権限 0600）に保存します。

| オプション     | 内容                                                                        |
| -------------- | --------------------------------------------------------------------------- |
| `--no-browser` | ブラウザを自動で開かない                                                    |
| `--print`      | 取得したリフレッシュトークンを標準出力にも表示する（Docker で使う場合など） |

参照だけで使う場合は `MF_SCOPES=mfc/invoice/data.read` を付けて実行すると、書き込みの権限を持たないトークンになります。

### Docker で `auth` を実行する

コンテナ内で `localhost` を待ち受けても、ホストのブラウザからのリダイレクトは届きません。`MF_AUTH_LISTEN_HOST=0.0.0.0` で
待ち受けアドレスだけを変え、ポートを公開します（リダイレクト URI は `http://localhost:8765/callback` のまま）。
`MF_TOKEN_FILE` はボリュームでホストと共有している場所にしてください。

```bash
docker run -it --rm -p 8765:8765 -e MF_CLIENT_ID -e MF_CLIENT_SECRET -e MF_AUTH_LISTEN_HOST=0.0.0.0 -e MF_TOKEN_FILE=/tokens/token.json -v <ホームディレクトリ>/.config/mf-invoice-mcp-server:/tokens mf-invoice-mcp-server:latest auth --no-browser
```

### トークンの更新について

- アクセストークンの有効期限は 1 時間です。サーバーはリフレッシュトークンで自動的に取り直します（期限 5 分前から）。
- 新しいリフレッシュトークンが返された場合はトークンファイルを書き換えるので、サーバーを再起動しても使い続けられます。
- トークンファイルのリフレッシュトークンが失効していた場合は、環境変数 `MF_REFRESH_TOKEN` の値で 1 回だけやり直します。
- どちらも使えなくなったら、もう一度 `auth` を実行してください。

## 3. MCP クライアントに登録する

### Claude Code

```bash
claude mcp add mf-invoice -e MF_CLIENT_ID=<クライアントID> -e MF_CLIENT_SECRET=<クライアントシークレット> -e MF_READ_ONLY=true -- npx -y @toolchainjp/mf-invoice-mcp-server
```

書き込み系も使う場合は `-e MF_READ_ONLY=true` を外します。

### Claude Desktop など（JSON で設定するクライアント）

```json
{
  "mcpServers": {
    "mf-invoice": {
      "command": "npx",
      "args": ["-y", "@toolchainjp/mf-invoice-mcp-server"],
      "env": {
        "MF_CLIENT_ID": "<クライアントID>",
        "MF_CLIENT_SECRET": "<クライアントシークレット>",
        "MF_READ_ONLY": "true",
        "MF_EXCLUDE_TOOLS": "post_billings_billing_id_posting,post_quotes_quote_id_posting"
      }
    }
  }
}
```

### Docker で起動する

```bash
docker build -t mf-invoice-mcp-server:latest .
```

コンテナの中のトークンファイルは消えてしまうので、`auth --print` で表示したリフレッシュトークンを渡すか、
トークンファイルをボリュームで共有します。

```json
{
  "mcpServers": {
    "mf-invoice": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "MF_CLIENT_ID",
        "-e",
        "MF_CLIENT_SECRET",
        "-e",
        "MF_READ_ONLY",
        "-e",
        "MF_TOKEN_FILE=/tokens/token.json",
        "-v",
        "<ホームディレクトリ>/.config/mf-invoice-mcp-server:/tokens",
        "mf-invoice-mcp-server:latest"
      ],
      "env": {
        "MF_CLIENT_ID": "<クライアントID>",
        "MF_CLIENT_SECRET": "<クライアントシークレット>",
        "MF_READ_ONLY": "true"
      }
    }
  }
}
```

### アクセストークンだけで使う（簡易）

別の方法で取得したアクセストークンがあれば `MF_ACCESS_TOKEN` だけでも動きます。ただし 1 時間で失効し、自動更新はしません。

## 4. 動作確認

MCP クライアントで「自社の事業者情報を取得して」と頼むと `get_office` が呼ばれます。
認証情報が足りない場合は、ツールの結果に何を設定すべきかが表示されます。

## トラブルシューティング

| 症状                                              | 対処                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `auth` で「待ち受けできません」                   | 8765 番ポートが使用中です。別のポートをアプリポータルと `MF_REDIRECT_URI` の両方に設定します          |
| 認可画面で redirect_uri のエラー                  | アプリポータルのリダイレクト URI と `MF_REDIRECT_URI` が一字一句同じか確認します（末尾の `/` も含む） |
| 「クライアント認証に失敗しました」                | クライアント ID / シークレットと、クライアント認証方式（`MF_TOKEN_AUTH_METHOD`）を確認します          |
| 「リフレッシュトークンが無効か期限切れです」      | `auth` をもう一度実行します                                                                           |
| HTTP 403                                          | トークンのスコープが足りません。書き込みには `mfc/invoice/data.write` が必要です                      |
| HTTP 402（郵送依頼）                              | 郵送の料金の支払い設定が必要です。クラウド請求書の画面で確認します                                    |
| `MF_EXCLUDE_TOOLS に存在しないツール名があります` | ツール名の打ち間違いです。[docs/tools.md](tools.md) の名前を使います                                  |
