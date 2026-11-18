# マイク使用中のお手本の音を大きくする 手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 音を鳴らしている間だけ iPhone の音の出し方を `'playback'` にし、マイク使用中のお手本の音が耳元のスピーカーで小さくなるのを防ぐ。

**Architecture:** `src/audio/tone.js` に「スピーカーを借りる・返す」仕組み（数を数える＋返すのを200ミリ秒遅らせる）を作る。`playNote` が自動で借り、段4の聞き直しも借りる。マイクが開いているかは `mic.js` が tone.js に知らせる。

**Tech Stack:** 素の JavaScript、vitest ＋ jsdom

**Spec:** `docs/superpowers/specs/2026-11-18-speaker-route-design.md`

## Global Constraints

- 音量（`PEAK_GAIN`）は変えない
- `navigator.audioSession` が無い端末では何もしない（例外を出さない）
- マイクを閉じたあとは `'play-and-record'` に戻さない
- コードは短い関数と日本語の「なぜ」コメント（`CLAUDE.md`）

## Review Focus

1. **音が重なる・続けて鳴る**（段5のメロディ、段1の2音）：最後の音が終わって200ミリ秒たつまで `'playback'` のまま。途中で戻らない（Task 1）
2. **鳴っている途中でマイクを閉じた**（画面を離れた・隠した）：あとで `'play-and-record'` に戻さない（Task 1）
3. **stopAll で止めた**：借りた分はちゃんと返る（数がずれて `'playback'` のまま残らない）（Task 1）
4. **段4で判定が始まるとき**：`'play-and-record'` に戻っている（お手本1500ms＋待ち500ms＞戻すまで200ms）（Task 1）
5. **聞き直しの再生が失敗した**（`audio.play()` が断られた）：借りた分は返る（Task 1）

---

### Task 1: スピーカーを借りる仕組みと、つなぎこみ

**Files:**
- Modify: `src/audio/tone.js`, `src/audio/mic.js`（開いたとき・閉じたときに知らせる）, `src/screens/stage4.js`（聞き直しで借りる）, `docs/device-checklist.md`（1行足す）
- Delete: `public/audio-test.html`
- Test: `tests/audio/tone.test.js`, `tests/audio/mic.test.js`, `tests/ui/stage4.test.js`

**Interfaces（tone.js が新しく出すもの）:**
- `setMicActive(active: boolean): void`：mic.js が、開いたら `true`、閉じたら `false` を知らせる
- `borrowSpeaker(): () => void`：借りる。返す関数を返す（2回呼んでも1回分だけ返す）
  - 借りている数が 0 → 1 になるとき：`navigator.audioSession` があれば `'playback'` に
  - 返して数が 0 になったら、`RELEASE_DELAY_MS = 200` ミリ秒後に、まだ 0 で、かつマイクが開いていれば `'play-and-record'` に戻す
- `playNote` は、鳴らし始めに `borrowSpeaker()`、終わり（onended・安全タイマー・stopAll のどれでも）に返す
- `getAudioContext()` の「type が 'auto' なら 'playback'」は今のまま

- [ ] **Step 1: 失敗するテストを書く**（`navigator.audioSession = { type: 'auto' }` の偽物、`vi.useFakeTimers()`）
  - tone：`setMicActive(true)` → type を `'play-and-record'` に → `playNote` 中は `'playback'` → 終わって 199ms は `'playback'`、200ms で `'play-and-record'`
  - tone：マイクなし（`setMicActive(false)`）→ 鳴り終わっても `'playback'` のまま
  - tone：2音を続けて鳴らす（1音目の終わりから100ms後に2音目）→ その間に `'play-and-record'` にならない
  - tone：鳴っている途中で `setMicActive(false)` → 終わって 200ms たっても `'playback'`
  - tone：`stopAll()` で止めたあと 200ms で戻る（借りた数が 0 に戻っている）
  - tone：`borrowSpeaker()` の返す関数を2回呼んでも、ほかの借りを返してしまわない
  - tone：`navigator.audioSession` が無くても例外にならない
  - mic：`openMic` 成功で `setMicActive(true)` 相当（type が `'play-and-record'`）、`close()` 後は借りても戻らない
  - stage4：「自分の 声」の再生中は `'playback'`、`ended` で返る。`play()` が断られても返る
- [ ] **Step 2:** `npx vitest run tests/audio tests/ui/stage4.test.js` → FAIL
- [ ] **Step 3:** 書く。段4の聞き直しは、`audio.play()` の前に借り、`ended`・`pause`・失敗・画面の後始末のどれかで返す（1回だけ）
- [ ] **Step 4:** `npx vitest run` → すべて PASS、`npm run build` も通る（`dist/audio-test.html` が無い）
- [ ] **Step 5:** `docs/device-checklist.md` に「マイクを使う段（段2〜5）で、イヤホンなしでもお手本の音が段1と同じくらい聞こえる（Safari とホーム画面のアプリの両方）」を1行足す
- [ ] **Step 6: Commit** `git commit -m "マイク使用中もお手本の音を下のスピーカーから鳴らす"`
