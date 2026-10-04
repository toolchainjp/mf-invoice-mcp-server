---
description: format / lint / typecheck / test を順に実行し、検証報告フォーマットで結果を出す
disable-model-invocation: true
allowed-tools: Bash(node .claude/hooks/*), Bash(bash tests/harness/run.sh), Read, Grep, Glob
---

# /verify — 検証を実行して報告する

## コマンド（`.claude/harness.config.json` の `commands` から）

@.claude/harness.config.json

## 手順

1. `commands.format` → `commands.lint` → `commands.typecheck` → `commands.test` の順に **実際に実行する**。
   `{file}` を含むコマンドは、この作業で変更したファイル（`git diff --name-only` + 未追跡ファイル）それぞれに対して実行する。
   空文字のコマンドは「未設定」としてスキップし、報告に書く。
2. 失敗したら出力の要点（ファイル・行・メッセージ）を報告に含める。修正はこのコマンドの範囲外（報告のみ）。
3. `git diff` を見て、シークレットらしき文字列（API キー形式、`BEGIN PRIVATE KEY` 等）が無いか確認する。
4. 次の形式で報告する。**「すべて確認した」とは書かない。**

```
## 実施したこと
- 実行したコマンドを順に

## 確認できたこと（実行して検証済み）
- <command> → <結果の要点>

## 確認できなかったこと・未確認
- <スキップした項目とその理由>（未設定 / 環境要因 / 対象外）

## 判断が必要な点
- 失敗の扱い、未設定コマンドの追加要否など
```
