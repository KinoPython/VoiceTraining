# 段6 ①「買った曲で練習」手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 買った曲（と、パソコンで作った歌声だけのファイル）を読み込み、お手本の線と自分の声の線を重ねて、区間ごとに練習できる段6を作る。

**Architecture:** 曲のファイルとお手本の線は IndexedDB（`src/storage/songFiles.js`）、曲名・区間・前回の自分の線は今の localStorage の記録（`store.js` の `songs`）に入れる。計算（線を作る・音に区切る・判定・キーの案内）は `src/logic/` の DOM を使わない関数、再生は `src/audio/songPlayer.js`、画面は `src/screens/stage6List.js`・`stage6Song.js`・`vocalGuide.js`。

**Tech Stack:** いまと同じ（Vite、素の JS、Web Audio、pitchy、vitest＋jsdom、Playwright）。テスト用に `fake-indexeddb` を足す。

**Spec:** `docs/superpowers/specs/2026-11-19-stage6-songs-design.md`（この手順書は 7-1・7-2・7-3・7-5・8・9 章。7-3b のキー変更と 7-4 の YouTube は入れない）

## Global Constraints

- `CLAUDE.md` の言葉の決まり（言い切らない・責めない・禁止の言葉は `findBanned`）。お手本の線と合いぐあいには必ず「目安」と書く
- 曲ファイル・歌声だけのファイル・お手本の線はスマホの中だけ。**バックアップに入れない**。録った声は保存しない（自分の声の「高さの数字の並び」だけ保存してよい）
- 外のファイルを読み込まない（YouTube は ② なので、この手順書では使わない）
- 曲に合わせて歌う間は、スピーカーに切りかえない（`borrowSpeaker` を使わない）。聞くだけのときは `borrowSpeaker` を使う
- 速さを変えても高さが変わらないこと（`preservesPitch`）
- 1オクターブ上・下で合っていても「合っていた」に数える
- 数字の目安は `src/logic/config.js` の `CONFIG.stage6` に集める：`{ hopMs: 20, noteMinMs: 150, noteTolCents: 50, latencyMs: 120, leadInSec: 2, maxSections: 5, lengthMismatchSec: 1, keyAdviceMax: 6, rates: [1, 0.75, 0.5] }`
- コードは短い関数と日本語の「なぜ」コメント

## Review Focus

1. **iPhone の「ファイル」から選んだファイルが読めない形式・壊れている**：止まらずに「この ファイルは 読めません」と出し、曲は追加しない（Task 6）
2. **とても長い曲（6分など）**：線を作る間も画面が固まらず、進み具合が動く。途中で画面を離れたら作るのをやめる（Task 2・6）
3. **お手本の声がほとんど無い区間**（間奏だけを選んだ）：合いぐあいを 0% と言わず「この 区間には お手本の 声が ありません」と出す（Task 3・7）
4. **保存の容量が足りない**（IndexedDB の書き込み失敗）：止まらずに「保存できませんでした。ほかの 曲を 消すと 入る ことが あります」と出す（Task 1・6）
5. **イヤホンなしで「歌う」**：マイクが曲を拾う。歌う前に毎回「イヤホンを つけましたか？」の確認を出し、「つけた」を押すまで始めない（Task 7）

---

### Task 1: 曲の記録とファイルの置き場

**Files:**
- Create: `src/storage/songFiles.js`
- Modify: `src/storage/store.js`（`songs` を足す。history の stage を 1〜6 に）, `src/logic/config.js`（`CONFIG.stage6`）, `package.json`（devDependencies に `fake-indexeddb`）, `vitest.config.js`（setupFiles に `fake-indexeddb/auto`）
- Test: `tests/storage/songFiles.test.js`, `tests/storage/store.test.js`

**Interfaces:**
- Produces（store.js。状態に `songs: Song[]` を足す。`fillMissing` で形を確かめ、変なものは捨てる）:
  - `Song = { id: string, title: string, hasFile: boolean, hasVocal: boolean, durationSec: number, sections: Section[], keyAdvice: number }`
  - `Section = { id: string, name: string, startSec: number, endSec: number, lastLine: { t: number, midi: number | null }[] | null, lastRatio: number | null }`
  - `addSong(song: Song)`, `updateSong(id, patch: Partial<Song>)`, `removeSong(id)`, `getSong(id): Song | null`
  - `saveSection(songId, section: Section): { ok: true } | { ok: false, reason: 'max' }`（1曲に `CONFIG.stage6.maxSections` まで）, `removeSection(songId, sectionId)`
  - history は `stage` 1〜6 を受け入れる。段6の entry は `{ date, stage: 6, tries, successes, value: 平均の合いぐあい, songTitle: string }`
- Produces（songFiles.js。IndexedDB `koetore-files`、store `files`、キー `${songId}:${kind}`）:
  - `kind`：`'file' | 'vocal' | 'line'`（line はお手本の線の JSON）
  - `putFile(songId, kind, data: Blob | object): Promise<{ ok: true } | { ok: false, reason: 'quota' | 'other' }>`
  - `getFile(songId, kind): Promise<Blob | object | null>`
  - `removeSongFiles(songId): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**
  - store：初めの状態に `songs: []`。addSong → getSong で同じ。removeSong で消える
  - store：saveSection を6回 → 6回目は `{ ok:false, reason:'max' }`
  - store：history に stage 6 を足しても loadState で残る。stage 7 は捨てられる
  - store：`exportBackup()` の JSON に songs（曲名・区間・lastLine）が入り、**ファイルやお手本の線は入らない**
  - store：songs に変な形（null、title が数字）が入ったデータを読み込む → 捨てられて例外にならない
  - songFiles：putFile → getFile で同じ Blob（size が同じ）と同じ線のオブジェクト。removeSongFiles で3つとも null
  - songFiles：書き込みで QuotaExceededError → `{ ok:false, reason:'quota' }`（Review Focus 4。IDB の put を差しかえて確かめる）
- [ ] **Step 2:** `npx vitest run tests/storage` → FAIL
- [ ] **Step 3:** 書く。`npm i -D fake-indexeddb@6`
- [ ] **Step 4:** `npx vitest run` → すべて PASS
- [ ] **Step 5: Commit** `git commit -m "段6：曲の記録とファイルの置き場"`

### Task 2: 曲からお手本の線を作る

**Files:**
- Create: `src/logic/songLine.js`
- Test: `tests/logic/songLine.test.js`

**Interfaces:**
- Consumes: `detectPitch`, `createSmoother`（pitch.js）, `CONFIG.stage6`
- Produces:
  - `extractLine(samples: Float32Array, sampleRate: number, { onProgress?: (ratio: number) => void, signal?: AbortSignal, yieldEvery?: number = 200 }): Promise<{ hopMs: number, midi: (number | null)[] }>`：`hopMs` ごとに 2048 点の窓で `detectPitch`、ならしてから入れる。`yieldEvery` フレームごとに `await` で画面に順番を返す（Review Focus 2）。`signal` が止められたら `AbortError` で終わる
  - `toNotes(line, { minMs = noteMinMs, tolCents = noteTolCents }): { midi: number, startMs: number, endMs: number }[]`：高さがほぼ同じ（最初の値から `tolCents` 以内）で `minMs` 以上続く所を1つの音にする。null で切れる。音の高さはその中の中央値
  - `keyAdvice(notes, range): number`：お手本の音の 95パーセンタイルの高さが `range.high` を超える分（半音、切り上げ）。0〜`keyAdviceMax`。range が null なら 0
  - `mixToMono(audioBuffer): Float32Array`

- [ ] **Step 1: 失敗するテストを書く**（音はテストの中で正弦波を並べて作る）
  - 220Hz を 1秒・null（無音）0.3秒・247Hz を 1秒 → `toNotes` が `[{midi≈57,…},{midi≈59,…}]` の2つ。startMs は 0 前後と 1300 前後
  - 100ms しか続かない音は音にならない
  - `onProgress` が 0〜1 の間で増えていき、最後は 1
  - `signal` を途中で止める → `AbortError` で reject
  - `keyAdvice`：お手本の上の方が 66、range.high が 63 → 3。上の方が 60 → 0。上が 80 → 6（上限）
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段6：曲からお手本の線を作る"`

### Task 3: 区間の判定

**Files:**
- Create: `src/logic/songScore.js`
- Test: `tests/logic/songScore.test.js`

**Interfaces:**
- Consumes: `noteVerdicts`（melodies.js）, `centsOff`/`foldOctave`（notes.js）, `toleranceFor`, `CONFIG.stage6.latencyMs`
- Produces:
  - `notesInSection(notes, startSec, endSec): note[]`（区間に重なる音だけ。時刻は区間の始まりからの ms に直す）
  - `scoreSection(readings: {t, midi}[], notes, toleranceCents, latencyMs = CONFIG.stage6.latencyMs): { ratio: number | null, verdicts: ('ok' | 'high' | 'low' | 'none')[] }`：readings の t から latencyMs を引いてから判定（マイクの遅れ）。オクターブずれは合っていたに数える。**notes が空なら ratio は null**（Review Focus 3）
  - `lineToGhost(readings): {t, midi}[]`：前回の線として保存する形（20ms ごとに間引く）

- [ ] **Step 1: 失敗するテストを書く**
  - お手本どおり（120ms 遅れて）歌った readings → ratio 1 前後、verdicts すべて 'ok'
  - 2つ目の音だけ 1.5半音上 → verdicts[1] が 'high'
  - 1オクターブ下でぴったり → 'ok'
  - notes が空 → `{ ratio: null, verdicts: [] }`
  - notesInSection：区間 1.0〜2.0秒、音が 0.5〜1.5秒 → 入る（startMs 0 から）
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段6：区間の判定"`

### Task 4: 曲の再生

**Files:**
- Create: `src/audio/songPlayer.js`
- Test: `tests/audio/songPlayer.test.js`

**Interfaces:**
- Consumes: `borrowSpeaker`（tone.js）
- Produces: `createSongPlayer({ fileBlob: Blob | null, vocalBlob: Blob | null, createAudio = (url) => new Audio(url) }): SongPlayer`
  - `SongPlayer.play({ fromSec: number, toSec: number, rate: number, source: 'file' | 'vocal', loop: boolean, speaker: boolean }): Promise<void>`：`preservesPitch = true`（と `webkitPreservesPitch`）。`toSec` に来たら loop なら `fromSec` に戻り、ちがえば止めて resolve。`speaker: true` のときだけ再生の間 `borrowSpeaker` を借りる
  - `stop()`, `currentSec(): number`, `onTime(cb: (sec) => void)`, `dispose()`（再生を止め、Object URL を revoke、借りを返す）
  - 片方の Blob しかないときは、ある方だけを使う（source の指定が無い方なら、ある方にする）

- [ ] **Step 1: 失敗するテストを書く**（audio 要素は偽物。currentTime と timeupdate を手で動かす）
  - play({fromSec:10,toSec:12,rate:0.75,…}) → 偽 audio の currentTime 10、playbackRate 0.75、preservesPitch true
  - currentTime が 12 を超える → loop なら 10 に戻る。loop でなければ pause して resolve
  - speaker:true の再生中は audioSession が 'playback'、speaker:false では借りない
  - dispose で revokeObjectURL が2つ（両方の Blob）、再生が止まる
  - vocalBlob が null で source:'vocal' → file を使う
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段6：曲の再生"`

### Task 5: 曲の線の絵

**Files:**
- Create: `src/ui/songOverview.js`
- Modify: `src/ui/pitchGraph.js`（前回の線を薄く描く `setGhost`、地図の外の帯の色）, `src/styles.css`
- Test: `tests/ui/songOverview.test.js`, `tests/ui/pitchGraph.test.js`

**Interfaces:**
- Produces:
  - `createSongOverview(canvas, { notes, durationSec, onSelect: (startSec, endSec) => void }): { setSelection(startSec, endSec), setPlayhead(sec) }`：曲全体のお手本の音を横長に描く。指でなぞる（pointerdown→move→up）と区間を選ぶ。`xToSec(x, width, durationSec)` を出してテストする
  - pitchGraph に `setGhost(points: {t, midi}[] | null)`（`--muted` の色で薄く）と、`setBands` の帯に `over: true` があれば `--band-over` の色

- [ ] **Step 1: 失敗するテストを書く**
  - `xToSec(0, 300, 240) === 0`、`xToSec(300, 300, 240) === 240`、範囲外は 0〜durationSec に入れる
  - pointerdown(x=30)→pointerup(x=60)（幅300・240秒）→ onSelect(24, 48)。逆向きになぞっても (24, 48)
  - setGhost を呼んでも jsdom で例外にならない（getContext が無い）。記録用の ctx では ghost の線が描かれる（strokeStyle に muted の色）
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段6：曲の線の絵と前回の線"`

### Task 6: 曲の一覧と追加

**Files:**
- Create: `src/screens/stage6List.js`
- Modify: `src/data/copy.js`（STAGES に `{ n: 6, route: 'stage6', name: '好きな 曲', desc: '買った 曲で、お手本の 線と 重ねて 練習します' }`）, `src/screens/home.js`（段6のカード。`recommendStage` は変えない）, `src/main.js`（`stage6`・`song`・`vocalGuide` を登録）
- Test: `tests/ui/stage6List.test.js`, `tests/ui/home.test.js`

**Interfaces:**
- Consumes: Task 1・2、`renderKeyboard` は使わない
- 画面：
  - 入口に「曲に 合わせて 歌う ときは、イヤホンが 必要です。」「高い 所を 無理に くり返さない ように しましょう。」
  - 一覧：曲名と印（🎵 曲ファイル・🎤 歌声だけ）。押すと `song?id=…`。「消す」（確認つき）
  - 「＋ 曲を 足す」：曲名の入力、「曲の ファイルを 選ぶ」「歌声だけの ファイルを 選ぶ」（`<input type=file accept="audio/*">`、どちらか1つ以上）、「歌声だけの ファイルの 作り方 ›」→ `vocalGuide`
  - 「追加する」：ファイルを `decodeAudioData` で読む（読めなければ「この ファイルは 読めません」、Review Focus 1）→ 両方あって長さが `lengthMismatchSec` 以上ちがえば「同じ 曲か 確かめて ください」（追加は止めない）→ お手本の線を作る（歌声だけがあればそれから。無ければ曲から作り、「伴奏が まざって いるので、線は 目安です」）。「お手本の 線を 作って います… ○%」→ putFile（失敗なら Review Focus 4 の文）→ addSong（keyAdvice は段2の range から）→ 曲の画面へ
  - 作っている途中で画面を離れたら AbortController で止める（Review Focus 2）

- [ ] **Step 1: 失敗するテストを書く**（decodeAudioData・extractLine は deps で差しかえ）
  - ホームに段6のカード、`recommendStage` は今のまま
  - 読めないファイル → 「この ファイルは 読めません」、songs は空のまま
  - 曲ファイルだけ → 「伴奏が まざって いるので」が出て、putFile が 'file' と 'line' で呼ばれる
  - 長さが2秒ちがう2つ → 「同じ 曲か 確かめて ください」
  - putFile が quota → 「保存できませんでした」、songs は空のまま
  - 作っている途中に `go('home')` → extractLine に渡した signal が止められる
  - 画面の文に findBanned が空
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段6：曲の一覧と追加"`

### Task 7: 曲で練習する画面

**Files:**
- Create: `src/screens/stage6Song.js`
- Test: `tests/ui/stage6Song.test.js`

**Interfaces:**
- Consumes: Task 1〜5、`createMicSession`（practiceLoop.js）, `createPitchGraph`, `toleranceFor`（段5のレベル `levels.s5`）, `todayString`, `tipNote`（使わない）
- 画面（設計書 7-3）：
  - 曲名、キーの案内（keyAdvice > 0 なら「この 曲は、キーを ○つ 下げると 楽に なりそう です（目安）。カラオケでは キーを 下げて みましょう」）
  - 全体の線（Task 5）でなぞって区間を選ぶ。保存した区間のボタン（「区間1」…）と「区間を 保存」（上限なら「保存できる 区間は 5つ までです」）
  - 「▶ 聞く」：区間をくり返し、`speaker: true`。速さ（1／0.75／0.5）、聞く音（原曲／歌声だけ。ある方だけ選べる）
  - 「● 歌う」：毎回「イヤホンを つけましたか？」→「つけた」で始める（Review Focus 5）→ マイクを開く → 区間の `leadInSec` 前から1回流す（`speaker: false`）→ 帯（お手本の音。声の地図の high を超える音は `over: true`）と自分の線、前回の線（ghost）→ 区間の終わりで止める
  - 結果：「いまの 合いぐあい：○%（目安）」と「前回：○%」、音ごとの「高め／低め／合って いた」。ratio が null なら「この 区間には お手本の 声が ありません」（Review Focus 3）。over の音があれば「高い 所は 無理に のばさないで ください」
  - 区間を保存してあれば、今回の線を `lastLine`、ratio を `lastRatio` にする。history に段6を足す（おわる・画面を離れるとき、tries > 0 なら）
  - 後始末：再生を止め、マイクを閉じ、songPlayer を dispose

- [ ] **Step 1: 失敗するテストを書く**（songPlayer・openMic・getFile は deps で差しかえ）
  - 「歌う」→ イヤホンの確認が出て、「つけた」までマイクは開かない
  - お手本どおりの値を流す → 「合いぐあい」に「（目安）」、100% 前後
  - 間奏だけの区間 → 「お手本の 声が ありません」
  - 区間を保存して2回歌う → 2回目に「前回：」が出る
  - 「聞く」は speaker:true、「歌う」は speaker:false で play
  - 画面を離れる → songPlayer.dispose とマイクの close、history に stage 6
  - findBanned が空
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段6：曲で練習する画面"`

### Task 8: 歌声だけのファイルの作り方・きろく

**Files:**
- Create: `src/screens/vocalGuide.js`, `src/data/vocalGuide.json`
- Modify: `src/screens/record.js`（段6の行：「好きな 曲：{曲名} ○回 中 ○回 できた・合いぐあい 平均 ○%（目安）」）, `docs/safety/content-review.md`（段6の文の表）
- Test: `tests/ui/vocalGuide.test.js`, `tests/ui/record.test.js`

- 案内の中身（`vocalGuide.json`）：パソコン（Windows・Mac）で使える**無料**の歌声分離ソフトを WebSearch で調べて1つ選ぶ（配布元・ライセンスを確かめ、出典の URL を書く）。手順は短い文で5つ前後：ソフトを入れる → 曲のファイルを選ぶ → 「歌声だけ」を書き出す → iCloud Drive に入れる → こえトレで「歌声だけの ファイルを 選ぶ」。パソコンへの曲の取り出し方（ミュージック／iTunes で買った曲のファイルの場所）も書く
- 必ず入れる一文：「作った ファイルは 自分で 使う だけに して、人に 渡したり ネットに 上げたり しないで ください。」

- [ ] **Step 1: 失敗するテストを書く**
  - 案内の画面に上の一文と、出典のリンク（https）がある。findBanned が空
  - きろくに段6の行が曲名つきで出る
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段6：歌声だけのファイルの作り方ときろく"`
- 文の AI 専門家チェック（声・著作権の目線）は、この作業のあとに controller が別に行い、`docs/safety/content-review.md` に残す

### Task 9: 通しのテスト・実機の確かめ表・引き継ぎ

**Files:**
- Create: `e2e/stage6.spec.js`, `e2e/fixtures/song.wav`（`scripts/make-fixture.mjs` に足す：220Hz 2秒・無音 0.5秒・247Hz 2秒）
- Modify: `docs/device-checklist.md`, `docs/HANDOFF.md`

- [ ] **Step 1:** e2e：段6 → 曲を足す（song.wav を曲ファイルとして setInputFiles）→ 線ができて曲の画面 → 区間をなぞる → 区間を保存 → 「聞く」が押せる → ホームに戻ると一覧に曲がある。オフラインで開いても曲の画面が開ける
- [ ] **Step 2:** `npm run e2e` → PASS、`npm test` → PASS
- [ ] **Step 3:** 実機の確かめ表に：「ファイル」から m4a を選べる、6分の曲で線が作れる（時間）、0.5倍で高さが変わらない、イヤホンで歌うと線が出る、マイクの遅れ（線が右にずれていないか）、聞くときはスピーカーで大きい
- [ ] **Step 4:** HANDOFF に段6①の状態と、次の ②YouTube・キー変更を書く
- [ ] **Step 5: Commit** `git commit -m "段6：通しのテスト・実機の確かめ表・引き継ぎ"`
