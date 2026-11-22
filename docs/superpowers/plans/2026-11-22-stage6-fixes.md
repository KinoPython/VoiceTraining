# 段6 ①の直し 手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 区間を消せるようにし、保存した区間を上書きできるようにし、一覧を開いたときの自動の掃除をやめて、バックアップの読み込みのときだけ確認つきで掃除する。

**Architecture:** 区間は `src/screens/stage6Song.js` と `store.js`（`removeSection`、`saveSection` の上書き）。掃除は `src/screens/stage6List.js` から外し、`src/screens/settings.js` のバックアップ読み込みに確認を足して、そこから呼ぶ。

**Tech Stack:** いまと同じ（素の JS、vitest＋jsdom、Playwright）

**Spec:** `docs/superpowers/specs/2026-11-22-stage6-fixes-design.md`

## Global Constraints

- `CLAUDE.md` の言葉の決まり（責めない・言い切らない・禁止の言葉は `findBanned`）
- 曲ファイル・お手本の線はバックアップに入れない／スマホの外に出さない
- 確認は `window.confirm`（テストで差しかえられるよう deps に出す）
- コードは短い関数と日本語の「なぜ」コメント

## Review Focus

1. **記録が空でファイルだけ残っている**：一覧を開いただけではファイルが消えない（Task 2）
2. **区間を消したあとの選択**：消した区間が選ばれたままにならず、選択がなくなる（Task 1）
3. **バックアップの「いいえ」**：記録もファイルも変わらない（Task 2）
4. **上書きで前回の線が消える**：確認の「いいえ」では消えない（Task 1）

---

### Task 1: 区間を消す・上書きする

**Files:**
- Modify: `src/screens/stage6Song.js`, `src/storage/store.js`（上書きの入口が足りなければ）, `src/screens/stage6Song.js` の TEXT
- Test: `tests/ui/stage6Song.test.js`, `tests/storage/store.test.js`

- [ ] **Step 1: 失敗するテストを書く**（deps に `confirm` を足して差しかえる）
  - 区間を5つ保存 → 「区間を 保存」で `保存できる 区間は 5つ までです。いらない 区間を 消すと 保存できます`
  - 保存した区間を選ぶと「区間を 消す」が出る。confirm が false → 消えない。true → 区間が1つ減り、選択がなくなる。そのあと新しい区間を保存できる
  - 保存した区間を選んで端を動かす → 「まだ 保存して いません」と「上書きする」「新しい 区間として 保存」が出る
  - 「上書きする」：confirm が false → 範囲も前回の線も変わらない。true → 同じ id で範囲が新しくなり、`lastLine` と `lastRatio` が null になる
  - 新しい文に `findBanned` が空
- [ ] **Step 2:** `npx vitest run tests/ui/stage6Song.test.js tests/storage/store.test.js` → FAIL
- [ ] **Step 3:** 実装。上書きは同じ id・新しい startSec/endSec・lastLine/lastRatio は null で `saveSection`（同じ id は上書きされる）に渡す
- [ ] **Step 4:** `npx vitest run` → すべて PASS
- [ ] **Step 5: Commit** `git commit -m "段6：区間を消す・上書きする"`

### Task 2: ファイルの掃除を確認つきのバックアップ読み込みだけにする

**Files:**
- Modify: `src/screens/stage6List.js`（`removeOrphans` とその呼び出しを外す。`listSongIds` は残す）, `src/screens/settings.js`（読み込む前の確認、読み込んだあとの掃除）, `src/data/copy.js` か画面の TEXT
- Test: `tests/ui/stage6List.test.js`, `tests/ui/settings.test.js`

**Interfaces:**
- Consumes: `listSongIds()`, `removeSongFiles(id)`（songFiles.js）, `loadState().songs`（store.js）
- Produces: settings の deps に `confirm`, `listSongIds`, `removeSongFiles` を足す（既定は本物）

- [ ] **Step 1: 失敗するテストを書く**
  - 記録が空で IndexedDB にファイルがある状態で一覧を開く → `removeSongFiles` が呼ばれない（Review Focus 1）
  - バックアップ読み込み：confirm が false → `importBackup` も `removeSongFiles` も呼ばれず、記録は変わらない（Review Focus 3）
  - confirm が true → 読み込んだあとの記録に無い曲のファイルだけが消える（記録にある曲のファイルは残る）
  - confirm の文は `このスマホの 曲で、バックアップに 無い ものは 消えます。読み込みますか？`。`findBanned` が空
  - 読み込みが失敗（壊れたファイル）→ 何も消さない
- [ ] **Step 2:** `npx vitest run tests/ui/stage6List.test.js tests/ui/settings.test.js` → FAIL
- [ ] **Step 3:** 実装。確認は曲が1つ以上あるときだけ出す（曲が無ければ今までどおり確認なしで読み込む）。掃除は `listSongIds` が null（読めない）のときは何もしない
- [ ] **Step 4:** `npx vitest run` → すべて PASS、`npm run build`、`npm run e2e` も通る
- [ ] **Step 5:** `docs/device-checklist.md` に「区間を消せる／上書きできる」「バックアップの読み込みで確認が出る」を1行ずつ足す
- [ ] **Step 6: Commit** `git commit -m "段6：掃除は確認つきのバックアップ読み込みだけにする"`
