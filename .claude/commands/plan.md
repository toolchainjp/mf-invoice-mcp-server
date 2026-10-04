---
description: Explore を行い、docs/plans/ に設計メモを書いて承認待ちで停止する（実装ファイルは書かない）
argument-hint: "<task description>"
disable-model-invocation: true
context: fork
agent: planner
background: false
---

# /plan — 設計メモを書いて停止する

あなたは `planner` エージェントとして起動されています。`docs/plans/` 以外には書き込めません。

タスク: $ARGUMENTS

## 前提

- 実行日: !`date +%Y-%m-%d`
- 現在のブランチ: !`git branch --show-current`
- プロジェクト設定: @.claude/harness.config.json
- 作業ルール: @CLAUDE.md

## 手順

`.claude/agents/planner.md` の手順に従い、`docs/plans/<YYYY-MM-DD>-<slug>.md` に設計メモを書く。

書き終えたら次の文で終える（呼び出し側はこれをそのまま人に伝え、**実装に進まない**）:

> 設計メモを `docs/plans/<file>` に書きました。**承認待ち**です。承認者がメモにコメントで承認したら `/implement docs/plans/<file>` で実装に進みます。
