---
description: 決定的チェックが緑のときだけ、観点別の読み取り専用レビュアー 3 体を並列に走らせ、指摘を決定的にマージして出す
argument-hint: "[plan-path] [base-branch]"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Agent, Bash(node scripts/review/*), Bash(node scripts/agents/*), Bash(git diff *), Bash(git log *), Bash(mkdir -p .harness/review)
---

# /review — 観点別 3 並列レビュー

- 設計メモ: $0（未指定なら `docs/plans/` の最新ファイルを `Glob` で探す）
- 比較元ブランチ: $1（未指定なら `development`）

## 1. ゲート（決定的）

!`node scripts/review/gate.mjs --advisory`

上の出力（`--advisory` なので常に終了コード 0。判定は本文の先頭語で読む）が **CLOSED** で始まっていたら、**verifier を起動せずにここで終わる**。失敗しているチェックの内容をそのまま報告し、
「先に lint / typecheck / test を直してから `/review` を実行してください」と伝える。レビュアーは高価で、機械が拾える誤りが残っている
うちの指摘はノイズになるため、この順序は守る。

**OPEN** で始まっていたら 2 に進む。

## 2. 3 体を並列に起動する

verifier のモデル（`harness.config.json` から解決。この値以外を指定すると hook が拒否する）: !`node scripts/agents/model-for.mjs verifier`

**1 つのメッセージの中で `Agent` を 3 回呼ぶ**（順番に呼ぶと並列にならない）。各呼び出しの引数:

| subagent_type | model | prompt に渡すもの |
| --- | --- | --- |
| `verifier-spec` | 上で解決した値 | 設計メモのパスと本文、比較元ブランチ、差分の取り方 |
| `verifier-test` | 同上 | 同上 |
| `verifier-security` | 同上 | 同上 |

各 prompt には次を必ず含める:

- 設計メモのパス（`$0`、未指定なら見つけたパス）
- 「差分は `git diff <base>...HEAD` と `git diff HEAD` で自分で取ること」
- 「自分の観点だけを見ること。変更内容の要約は書かないこと」
- 「最後に、定義ファイルに書かれた JSON を単独のコードフェンスで出力すること」

## 3. 決定的にマージする

1. `mkdir -p .harness/review`
2. 各 verifier の **返り値をそのまま** `.harness/review/verifier-spec.json` / `verifier-test.json` / `verifier-security.json` に書く（加工しない）
3. マージを実行する:

```
node scripts/review/merge-findings.mjs .harness/review/verifier-spec.json .harness/review/verifier-test.json .harness/review/verifier-security.json
```

このスクリプトが順序（Blocking → Should fix → Nit）、同一ファイル・行の統合、結果を返さなかった観点の明示を行う。
**マージ結果を書き換えない。** 並べ替えや要約をやり直さない。

## 4. 報告する

マージ結果をそのまま出したうえで、指摘ごとに次を添える。

- **対応案**（どう直すか）または **対応しない理由**
- **修正はこの場で適用しない。** 人が承認してから `/implement` などで直す

Blocking が残っている場合は、その事実を先頭に書く。
