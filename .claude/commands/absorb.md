---
description: レビュー指摘や人の修正を受け取り、eval ケース / CLAUDE.md / hook のどれに蓄積するか提案して差分を作る
argument-hint: "<feedback text or path to a review comment>"
disable-model-invocation: true
---

# /absorb — 修正を蓄積する

フィードバック: $ARGUMENTS

## 前提

- 蓄積ルール: @CLAUDE.md
- 既存 eval ケース: !`ls evals/cases 2>/dev/null`
- hook のブロック規則: @.claude/hooks/pre-tool-use.mjs
- プロジェクト設定: @.claude/harness.config.json

## 手順

1. フィードバックを **1 文の期待** に言い換える（例: 「外部 API を呼ぶ変更では必ずタイムアウトを設定する」）。
2. 落とし先を決め、理由を書く:
   - **eval ケース**（`evals/cases/<nnn>-<slug>/case.yaml`）: 入力と期待出力が書けるとき。ルーブリックは `evals/rubrics/` に置く
   - **CLAUDE.md**: 毎回守る判断基準になるとき。該当セクションに 1〜3 行で追記
   - **hook / config**: そもそも実行させたくない操作のとき。`harness.config.json` の `protectedPaths` / `deploy.productionPatterns` で表せるならそれを、表せないなら `pre-tool-use.mjs` の `DESTRUCTIVE` への追加
3. 差分を作る:
   - `evals/**` と `CLAUDE.md` は直接編集してよい
   - `.claude/**` は Tier 3（編集不可）。代わりに **`docs/absorb/<date>-<slug>.patch`** に unified diff を書き、人が適用する
4. 報告する: 期待の 1 文、落とし先と理由、差分の場所、次に人がやること（パッチ適用 / PR 作成）。
   複数の落とし先に同時に落とすべきときはその旨を書く。
