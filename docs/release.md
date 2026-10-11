# リリース（npm への発行）

`main` のコミットにリリースタグ（`v1.2.3` など）を push すると、`.github/workflows/release.yml` が npm にパッケージを発行します。
手元で `npm publish` は実行しません。

```mermaid
flowchart LR
  feat["feature/* · fix/*<br/>（版を上げるコミットを含む）"] -- PR --> main[main]
  main -- "git tag v1.2.3 → push" --> tag((v1.2.3))
  tag --> wf[release.yml]
  wf --> check["検証<br/>タグ = version / main 上 / 未発行"]
  check --> test["npm run check<br/>format・lint・型・unit・E2E"]
  test --> publish["npm publish --provenance"]
  publish --> gh[GitHub Release]
  publish --> slack[Slack deploy.done]
```

## 発行ワークフローの動作

| ステップ              | 内容                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| トリガー              | タグ `v*.*.*` の push（GitHub の画面でタグ付きの Release を作った場合も同じ）                          |
| タグと version の一致 | タグ `vX.Y.Z` と `package.json` の `version` が違えば失敗                                              |
| main 上のコミットか   | タグのコミットが `main` に含まれていなければ失敗（マージ前の作業ブランチから誤って発行しない）         |
| 未発行か              | 同じ版が npm にあれば失敗                                                                              |
| 検証                  | `npm ci` → `npm run check`（format / lint / typecheck / ユニット / E2E）。外部 API には接続しない      |
| 同梱物の確認          | `npm pack --dry-run` の結果をログに出す（`dist/` と `README.md`、`LICENSE`、`package.json` だけ）      |
| 発行                  | `npm publish --provenance --access public`。版に `-` を含む（`1.2.0-rc.1` など）ときは dist-tag `next` |
| GitHub Release        | 無ければ作成（リリースノートは自動生成。プレリリース版はプレリリース扱い）                             |
| 通知                  | テンプレートの `notify-slack.yml` で `deploy.done` を送る（失敗してもワークフローは失敗しない）        |

発行ジョブは GitHub の Environment `npm` で動きます。Settings → Environments → `npm` に承認者を設定すると、発行の直前に人の承認を挟めます。

## 初回だけ行うこと

1. **npm の組織を用意する**。パッケージ名 `@toolchainjp/mf-invoice-mcp-server` は npm 組織 `toolchainjp` が必要です。
   別の名前にする場合は `package.json` の `name` を変えます（`src/version.ts` やメッセージは `package.json` から読みます）。
2. **`package.json` の `repository.url` を実際の GitHub リポジトリに合わせる**。provenance（来歴証明）はこの URL と
   ワークフローを実行したリポジトリが一致しないと失敗します。
3. **npm の認証を設定する**（どちらか）。
   - **Trusted Publishing（推奨）**: npmjs.com のパッケージ設定 → Trusted Publisher に GitHub Actions として
     リポジトリ、ワークフロー `release.yml`、Environment `npm` を登録します。シークレットは不要です。
     まだ一度も発行していないパッケージには設定できないため、最初の 1 回だけは下のトークン方式で発行します。
   - **トークン**: npmjs.com で Granular Access Token（対象パッケージへの Read and write）を作り、
     リポジトリシークレット `NPM_TOKEN` に登録します。アカウントで 2FA を有効にしている場合は
     **「Bypass two-factor authentication (2FA)」を有効に**しないと、発行時に `EOTP`（ワンタイムパスワードが必要）で失敗します。
     2FA を回避するトークンでの発行は 2027 年 1 月をめどに廃止予定のため、発行後は Trusted Publishing に切り替えます。

## リリース手順

1. 作業ブランチ（`feature/*` / `fix/*`）で版を上げるコミットを作ります。変更と同じ PR に含めても、版だけの PR にしても構いません。

   ```bash
   docker compose run --rm dev npm version patch --no-git-tag-version
   ```

   ```bash
   git commit -am "Release v0.1.2"
   ```

2. `main` 向けの PR を作り、CI が通ったらマージします（`main` は常にリリース可能）。
3. `main` を最新にして、マージ後のコミットにタグを付けて push します。これで発行ワークフローが動きます。

   ```bash
   git switch main && git pull && git tag v0.1.2 && git push origin v0.1.2
   ```

4. Actions の「Release」が成功したら、npm と GitHub Release を確認します。

版の付け方: 互換性のない変更（ツール名・引数の変更、環境変数の削除）は major、ツールの追加や機能追加は minor、修正は patch。
仕様書の更新でツール名や引数が変わる場合は major にします。

## うまくいかないとき

| エラー                                        | 対処                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| タグと package.json の version が一致しません | `package.json` の版を上げたコミットにタグを付け直します                         |
| タグのコミットが main に含まれていません      | `main` にマージしてから、`main` のコミットにタグを付けます                      |
| 既に npm に発行されています                   | npm は同じ版を再発行できません。版を上げて新しいタグを作ります                  |
| `npm publish` が 404 / 403                    | npm 組織の権限、Trusted Publisher の登録内容、`NPM_TOKEN` を確認します          |
| provenance のエラー                           | `package.json` の `repository.url` が実際のリポジトリと一致しているか確認します |

失敗したタグを消して付け直すときは、`git push --delete origin v0.1.1` の後にタグを作り直します（発行前に失敗した場合だけ）。
