# こえトレ

カラオケの音程トレーニングアプリ（PWA）。設計書は `docs/superpowers/specs/2026-11-18-karaoke-trainer-design.md`。

## 開発

- `npm run dev` … 開発用サーバー
- `npm test` … テスト
- `npm run e2e` … 画面の流れのテスト（偽のマイクで動かす。ビルドも自動）
- `npm run build` … 本番用ビルド（`dist`）

## Pages の設定（持ち主の作業）

`main` に push すると GitHub Actions が自動で公開します。最初に一度だけ、
GitHub の **Settings → Pages → Source を GitHub Actions にする** 必要があります。

`main` に入れると公開されます。くわしくは `docs/HANDOFF.md`、iPhone での確かめは `docs/device-checklist.md`。
