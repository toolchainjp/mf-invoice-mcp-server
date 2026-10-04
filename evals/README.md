# evals — ゴールデンケース

`CLAUDE.md`、`.claude/**`、`.mcp.json`、`docs/agent-harness/**`、`evals/**` を変更した PR で CI が実行します（`ci.yml` の `eval` ジョブ）。
ランナーは [promptfoo](https://www.promptfoo.dev/)（`npx` で都度実行、`package.json` は置かない）。

## 構成

```
evals/
  promptfooconfig.yaml      # ケース一覧・プロバイダ
  run.sh                    # CI / ローカル共通の実行スクリプト
  providers/claude.sh       # 被評価側: claude -p をこのリポジトリで実行
  providers/judge.sh        # LLM-as-judge: ルーブリックで判定し JSON を返す。判定ログを output/judge-log.jsonl に残す
  cases/<nnn>-<slug>/case.yaml   # 入力（prompt）・期待（assert）・評価基準（rubric への参照）
  rubrics/<name>.md         # judge が読むルーブリック（人が監査できるよう平文で置く）
  output/                   # 結果と judge ログ（gitignore。CI では artifact として保存）
```

## ケースの書き方

```yaml
description: 何を確かめるケースか
vars:
  prompt: |
    Claude Code に与える入力
assert:
  - type: icontains          # 決定的な検査を優先する
    value: 承認
  - type: llm-rubric         # 判断が要るものだけ judge に回す
    value: file://../../rubrics/escalation.md
```

- 決定的に書ける期待（見出しの有無、禁止語の不在、ファイルが作られていない等）は `icontains` / `not-icontains` / `regex` / `javascript` で書く
- judge を使うケースはルーブリックを `rubrics/` に置き、判定理由が `output/judge-log.jsonl` に残る

## ローカル実行

```
bash evals/run.sh                 # 全ケース
bash evals/run.sh --filter 001    # 一部
```

`claude` CLI にログイン済み（または `CLAUDE_CODE_OAUTH_TOKEN` が環境にある）であることが前提です。

## 蓄積ルールとの関係

レビュー指摘や人の修正を「入力と期待出力」で表せるときは、ここにケースを追加します（`CLAUDE.md` §5、`/absorb`）。
