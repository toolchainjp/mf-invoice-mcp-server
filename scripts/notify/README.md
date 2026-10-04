# scripts/notify — Slack 通知

GitHub Actions から呼ばれる片方向の Slack 通知です。Claude Code 本体はこのスクリプトを使いません（送信ツールを持たせない設計）。

```
node scripts/notify/send.mjs --event <event> --payload '<json>' [--thread-key owner/repo#N] [--config path] [--strict]
```

- 送信先: `.claude/harness.config.json` の `slack.channel`。空なら **スキップ**（exit 0、warning のみ）
- トークン: `slack.tokenSecretName` が指す環境変数（既定 `SLACK_BOT_TOKEN`）。未設定ならスキップ
- イベント個別の on/off: `slack.events.<event>`
- スレッド: 同じ Issue / PR（`--thread-key owner/repo#N`、または payload の `repo`+`number`）への通知は 1 スレッドにまとめる。親メッセージの `ts` は Issue / PR の hidden コメント `<!-- harness-slack-thread: <ts> -->` に保存する（`GITHUB_TOKEN` が必要）
- 失敗してもワークフローを失敗させない（`--strict` 指定時のみ exit 1）

## イベントと payload

共通: `repo` (`owner/repo`), `number`, `title`, `url`, `actor`

| event | 追加フィールド | メンション |
| --- | --- | --- |
| `plan.ready` | `questions`（未回答の質問数） | あり |
| `escalation` | `summary`（質問の要約） | あり |
| `pr.opened` | `blocking`, `shouldFix`, `nit`, `blockingItems[]`, `groups[]`（`{label, files}`。ウォークスルーの読み順。先頭 3 件だけ表示） | Blocking > 0 のときのみ |
| `verify.report` | `verified[]`, `unverified[]` | なし |
| `blocked` | `kind`（`tier3` / `budget.turns` / `budget.minutes`）, `reason` | なし |
| `ci.failed` / `eval.failed` | `job`, `runUrl` | なし |
| `deploy.done` | `target`, `deployUrl`, `runUrl` | なし |

## 書かないもの

差分、ログ全文、ファイル内容、シークレット値。`build-message.mjs` の `sanitize()` がコードブロック・diff 行・シークレット形式の文字列を落とし、各行を短く切ります。テストは `tests/harness/notify.test.mjs`。
