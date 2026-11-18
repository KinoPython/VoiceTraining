# 引き継ぎメモ（こえトレ）

次に作業する人（未来の自分や Claude）が、すぐ状況をつかめるようにまとめたメモです。

## いまの状態（v1）
- カラオケの音程トレーニングアプリ（PWA）。画面は全部できています：
  はじめて開く画面 / ホーム / 準備運動 / 段1〜5 / きろく / せってい / 安全のこと / 読みもの（記事）
- テストは 2 種類あります：
  - 部品のテスト（`npm test`）… 計算や画面の部品の確認
  - 画面の流れのテスト（`npm run e2e`）… 本物のブラウザで、偽のマイク（220Hz の音）を使って流れを確認
- **まだやっていないこと**：iPhone 実機での確認（`docs/device-checklist.md` を埋める）

## 動かし方
| やりたいこと | コマンド |
|---|---|
| 作りながら見る | `npm run dev` |
| 部品のテスト | `npm test` |
| 画面の流れのテスト | `npm run e2e`（ビルドも自動でする） |
| 本番用に作る | `npm run build`（`dist` に出る） |

偽マイクの音声を作り直したいときは `node scripts/make-fixture.mjs`。

## 大事な資料
- 設計書：`docs/superpowers/specs/2026-11-18-karaoke-trainer-design.md`
- 計画書：`docs/superpowers/plans/2026-11-18-karaoke-trainer-v1.md`
- 安全・文章の確認の記録：`docs/safety/content-review.md`
- 実機の確かめ表：`docs/device-checklist.md`
- 作業の決まり：`CLAUDE.md`（言葉の決まり・曲と著作権・声の扱い）

## 公開のしかた
- GitHub Pages に公開します。**`main` に push すると、GitHub Actions が自動で公開**します（`.github/workflows/pages.yml`）。
- リポジトリは public で、Pages の Source は「GitHub Actions」にすでに設定済み（持ち主が設定）。
- いまの作業ブランチは `main` ではないので、公開するには `main` に入れる（マージする）必要があります。

## 残っている宿題
1. **記事に日本語の公的な出典を足す**（日本耳鼻咽喉科頭頸部外科学会など）。いまは英語の論文（PMC）のみ。詳しくは `docs/safety/content-review.md`。
2. 実機の確認（`docs/device-checklist.md`）。ここで見つかった数字のずれは `src/logic/config.js` だけ直せば済みます。

## 次の版（v2）の予定
- **段6：YouTube で練習**
  - YouTube の **公式の埋め込みプレーヤー** だけを使う（曲のダウンロード機能は作らない）
  - A-B ループ（区間のくりかえし）、ゆっくり再生
  - イヤホンで聞きながら歌う使い方
- 段1・段2 のコツ（`src/data/tips.json` の `s1`・`s2`）は文だけ入っていて、**まだ画面に出していません**。段3 と同じようにつなげる。

## 注意事項
- 声の練習の助言には「苦しい・痛いときはやめる／続くときは耳鼻咽喉科」を必ず添える。
- 効果を言い切らない・病気の治療や予防をうたわない（`CLAUDE.md`）。
