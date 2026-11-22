# 段6 ②「YouTube で練習」手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 曲に YouTube のアドレスを足し、公式の埋め込みプレーヤーで区間（A〜B）をくり返し・ゆっくり聞き、歌ったあとに自分の線のゆれ・前回との重ね・声の地図の外に出た所を見られるようにする。

**Architecture:** YouTube に関わる部分は `src/audio/ytPlayer.js` の1か所に閉じこめ、画面は「player の薄い約束（play・pause・seekTo・currentSec・setRate・destroy）」だけを使う。テストでは偽のプレーヤーに差しかえる。時計・ゆれ・くり返しの計算は `src/logic/` の DOM を使わない関数。曲のデータは今の `songs` に `youtubeId` と `ytSections` を足す（曲ファイルの区間 `sections` とは別。動画と曲ファイルで頭出しの位置がちがうため）。

**Tech Stack:** いまと同じ（素の JS、vitest＋jsdom、Playwright）。YouTube IFrame Player API（`https://www.youtube.com/iframe_api`、埋め込みは `https://www.youtube-nocookie.com`）。

**Spec:** `docs/superpowers/specs/2026-11-19-stage6-songs-design.md`（7-4 章）

## Global Constraints

- `CLAUDE.md` の決まり：YouTube は**公式の埋め込みプレーヤーだけ**。保存・録音・ダウンロードはしない。言葉の決まり（責めない・目安・`findBanned`）。録った声は保存しない（高さの数字の並びだけ保存してよい）。マイクの声は外に送らない
- YouTube の読み込み（外のプログラム）は**この段6の YouTube だけの例外**。プライバシーのため `youtube-nocookie.com` を使い、曲を足す画面で「YouTube の プレーヤーを 読み込みます（YouTube に 接続します）。声は スマホの 外に 出ません」と知らせる
- 電波が無い・読み込めないときは止まらずに案内を出す。段1〜5と、買った曲の練習は今までどおり電波なしで動く
- 歌うときは毎回「イヤホンを つけましたか？」を確かめる（段6①と同じ文）。マイクは歌うときだけ開き、歌い終わったら閉じる（YouTube の聞くときの音量を小さくしないため）
- `public/sw.js` は他サイトのリクエストを無視している（今のまま。YouTube を保存しない）
- 数字の目安は `CONFIG.stage6.yt` に集める：`{ pollMs: 50, apiTimeoutMs: 8000, rates: [1, 0.75, 0.5], minVoicedMs: 400, stableCents: 25, wobblyCents: 50 }`
- 公式の仕様ページはこの作業環境から開けなかった。YouTube の細かい仕様（エラー番号、使える速さ）は、作る人が公式ページを開いて確かめ、確かめられなければ実機の確かめ表に回す
- コードは短い関数と日本語の「なぜ」コメント

## Review Focus

1. **埋め込みが止められている動画・消された動画・間違ったアドレス**：止まらずに理由の案内を出し、練習の画面に進まない（Task 1・3・5）
2. **電波なし／YouTube の読み込みが終わらない**：`apiTimeoutMs` で打ち切り、案内を出す。画面を離れたら読み込みの待ちもやめる（Task 3・5）
3. **動画が飛ぶ・止まる・広告で位置が進まない**：くり返しが `toSec` を見逃して終わらない、を防ぐ（時計の推定がずれたら次の確かめで戻す）（Task 2）
4. **歌っている途中で画面を離れる・アプリを隠す**：プレーヤーを壊し（destroy）、マイクを閉じる。履歴は歌い終えた回だけ（Task 5・6）
5. **声がほとんど無い歌**（息だけ・無音）：「安定」を言わずに「声が 聞こえませんでした」と出す（Task 2・6）

---

### Task 1: アドレスを読む・曲に YouTube を足せる記録

**Files:**
- Create: `src/logic/youtubeUrl.js`
- Modify: `src/storage/store.js`（Song に `youtubeId: string | null` と `ytSections: Section[]`。`saveSection`・`removeSection` に第3引数 `which = 'sections'`（`'sections' | 'ytSections'`）。history に `kind?: 'yt'` を許す）, `src/logic/config.js`（`CONFIG.stage6.yt`）
- Test: `tests/logic/youtubeUrl.test.js`, `tests/storage/store.test.js`

**Interfaces:**
- Produces:
  - `parseYoutubeId(input: string): string | null`：`youtu.be/ID`、`youtube.com/watch?v=ID`（`m.`・`music.`・`www.` も）、`/shorts/ID`、`/embed/ID`、`/live/ID` から 11 文字の ID（`[A-Za-z0-9_-]{11}`）を返す。`&t=` や `?list=` が付いていてもよい。前後の空白は無視。ほかのサイト・ID ではない文字列・`javascript:` などは `null`
  - store：`updateSong(id, { youtubeId })` で足す／消せる（null）。`getSong(id).ytSections` は常に配列（最大 `maxSections`）。`saveSection(songId, section, 'ytSections')`、`removeSection(songId, sectionId, 'ytSections')` は `sections` と同じ決まり（同じ id は上書き、上限は `max`）
  - history の段6の記録 `{ date, stage: 6, tries, successes, value, songTitle, kind?: 'yt' }`。`kind` が `'yt'` 以外なら捨てる
  - バックアップには `youtubeId`・`ytSections` を入れてよい（ファイル・線は入れない決まりは変えない）

- [ ] **Step 1: 失敗するテストを書く**
  - `parseYoutubeId('https://youtu.be/dQw4w9WgXcQ?t=43') === 'dQw4w9WgXcQ'`、`watch?v=dQw4w9WgXcQ&list=PL1`、`m.youtube.com`、`music.youtube.com`、`/shorts/dQw4w9WgXcQ`、`/embed/dQw4w9WgXcQ`、前後に空白
  - `null`：`''`、`'hello'`、`'https://example.com/watch?v=dQw4w9WgXcQ'`、`'javascript:alert(1)'`、`watch?v=short`、`'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ'`（Review Focus 1）
  - store：`updateSong` で `youtubeId` が残る・null で消える。`ytSections` が無い古い曲を読んでも `[]`。`saveSection(..., 'ytSections')` が6回目で `max`、`sections` とは別々に増える。`youtubeId` が文字列でない曲データは null にされる
  - store：history に `kind: 'yt'` は残り、`kind: 'x'` は捨てられる。`exportBackup()` に `youtubeId`・`ytSections` が入り、ファイルや線は入らない
- [ ] **Step 2:** `npx vitest run tests/logic/youtubeUrl.test.js tests/storage/store.test.js` → FAIL
- [ ] **Step 3:** 実装。`cleanSong` で `youtubeId` は `/^[A-Za-z0-9_-]{11}$/` に合うものだけ残す
- [ ] **Step 4:** `npx vitest run` → すべて PASS
- [ ] **Step 5: Commit** `git commit -m "段6②：YouTube のアドレスと曲の記録"`

### Task 2: 時計・くり返し・ゆれの計算

**Files:**
- Create: `src/logic/ytClock.js`, `src/logic/stability.js`
- Test: `tests/logic/ytClock.test.js`, `tests/logic/stability.test.js`

**Interfaces:**
- Produces（ytClock.js）:
  - `createSongClock(): { update(sec: number, nowMs: number, playing: boolean, rate: number): void, estimate(nowMs: number): number }`：最後に読んだ再生位置から、`playing` の間は `(nowMs − 最後に読んだ時刻) × rate / 1000` だけ進めて推定する。`playing` でないとき・まだ読んでいないときは最後の位置（無ければ 0）。`update` で位置が推定より 0.3 秒以上ずれたら、読んだ値に合わせなおす（動画が飛んだ・止まったとき）
  - `loopAction(currentSec: number, fromSec: number, toSec: number, loop: boolean): 'continue' | 'seek' | 'stop'`：`currentSec >= toSec` なら、loop なら `'seek'`（`fromSec` へ）、でなければ `'stop'`。`currentSec < fromSec − 1`（区間より前に外れた）ときも loop なら `'seek'`、でなければ `'continue'`
- Produces（stability.js）:
  - `stabilityOf(readings: { t: number, midi: number | null }[], opts = CONFIG.stage6.yt): { label: 'steady' | 'some' | 'wobbly' | 'none', medianCents: number | null, stretches: number }`：声のある（midi が null でない）連続を1つのまとまりとし、`minVoicedMs` 以上のまとまりだけを使う。各まとまりの中央値からのずれ（セント）の標準偏差を求め、まとまりの長さで重みをつけて平均。`≤ stableCents` なら 'steady'、`≤ wobblyCents` なら 'some'、それより大きければ 'wobbly'。使えるまとまりが無ければ `{ label: 'none', medianCents: null, stretches: 0 }`
  - `outsideRange(readings, range): { above: number, below: number }`：声の地図（`range.low`〜`range.high`）より上・下に出た読みの数。`range` が null なら 0・0
  - `lineForGhost(readings, latencyMs)` は作らない（段6①の `lineToGhost` を使う）

- [ ] **Step 1: 失敗するテストを書く**
  - clock：`update(10, 0, true, 1)` → `estimate(500) === 10.5`。rate 0.5 で `estimate(1000) === 10.5`。`playing:false` なら進まない。推定より 0.3 秒以上ずれた `update` で合わせなおす。未更新は 0（Review Focus 3）
  - loopAction：`(12, 10, 12, true) === 'seek'`、`(12, 10, 12, false) === 'stop'`、`(11.9, 10, 12, true) === 'continue'`、`(5, 10, 12, true) === 'seek'`、`(5, 10, 12, false) === 'continue'`
  - stability：同じ高さを 1 秒（20ms ごと）→ 'steady'。±40 セントでゆれる 1 秒 → 'wobbly'。300ms だけの声 → 'none'。null ばかり → 'none'（Review Focus 5）。2つのまとまりで、長い方が重く効く
  - outsideRange：range なし → 0・0、上に 3 読み・下に 2 読み → `{above:3, below:2}`
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段6②：時計・くり返し・ゆれの計算"`

### Task 3: YouTube プレーヤーの包み

**Files:**
- Create: `src/audio/ytPlayer.js`
- Modify: `src/data/copy.js`（`STAGE6_TEXT` に YouTube の案内文）
- Test: `tests/audio/ytPlayer.test.js`

**Interfaces:**
- Consumes: `CONFIG.stage6.yt.apiTimeoutMs`
- Produces:
  - `loadYouTubeApi({ loadScript = defaultLoadScript, timeoutMs = CONFIG.stage6.yt.apiTimeoutMs, win = window }): Promise<YTNamespace>`：すでに `win.YT?.Player` があればそれを返す。なければ `https://www.youtube.com/iframe_api` を `<script>` で読み、`onYouTubeIframeAPIReady` を待つ。同時に何回呼んでも1回だけ読む。`timeoutMs` で `{ name: 'YtTimeout' }` を reject、読み込みエラーは `{ name: 'YtLoadError' }` で reject（失敗したら次の呼び出しでやりなおせる。失敗を覚えない）
  - `createYtPlayer(container: HTMLElement, { videoId: string, YT: YTNamespace, onState?: (state: 'playing' | 'paused' | 'ended' | 'buffering' | 'cued') => void, onError?: (code: number) => void }): Promise<YtPlayer>`：`new YT.Player(el, { host: 'https://www.youtube-nocookie.com', videoId, playerVars: { playsinline: 1, rel: 0, origin: location.origin, controls: 1 }, events })`。`onReady` で resolve。`onError` がその前に来たら reject（`{ name: 'YtPlayerError', code }`）
  - `YtPlayer`：`play(): void`、`pause(): void`、`seekTo(sec: number): void`（`allowSeekAhead: true`）、`currentSec(): number`、`duration(): number`、`setRate(rate: number): number`（使える速さの中でいちばん近いものにし、実際に設定した値を返す）、`availableRates(): number[]`、`destroy(): void`（2回呼んでも例外にならない）
  - `ytErrorKey(code: number): 'notEmbeddable' | 'notFound' | 'badId' | 'noReferer' | 'other'`：公式ページで確かめた番号に合わせる。確かめられなければ、`101`・`150` → `'notEmbeddable'`、`100` → `'notFound'`、`2` → `'badId'`、`153` → `'noReferer'`、それ以外 → `'other'` とし、コメントに「公式で未確認」と書く
  - 案内文（`STAGE6_TEXT`）：`ytNotEmbeddable`「この 動画は 持ち主の 設定で、アプリの 中では 流せません」、`ytNotFound`「この 動画は 見つかりません。アドレスを 確かめて ください」、`ytBadId`「アドレスを 読み取れません」、`ytNoReferer`「この 画面から YouTube を 開けませんでした。ブラウザで 開きなおして みて ください」、`ytOther`「YouTube を 再生できませんでした」、`ytOffline`「電波が ない ときは YouTube は 使えません。買った 曲の ファイルは 電波なしで 使えます」

- [ ] **Step 1: 失敗するテストを書く**（偽の `YT.Player`：コンストラクタが `{host, videoId, playerVars, events}` を記録し、テストから `events.onReady`・`onError`・`onStateChange` を呼べる。メソッドは呼び出しを記録）
  - `loadYouTubeApi`：`win.YT` があれば `loadScript` を呼ばない。2回同時に呼んでも `loadScript` は1回。`onYouTubeIframeAPIReady` が呼ばれたら resolve。時間切れで `YtTimeout`（フェイクタイマー）。`loadScript` が失敗 → `YtLoadError`、そのあと呼びなおすと再び `loadScript` が呼ばれる（Review Focus 2）
  - `createYtPlayer`：コンストラクタに `host: 'https://www.youtube-nocookie.com'` と `playerVars.playsinline === 1` が渡る。`onReady` で resolve。`onReady` の前の `onError(101)` で `YtPlayerError` と `code: 101` で reject（Review Focus 1）
  - `setRate(0.6)` は使える速さ `[0.25, 0.5, 0.75, 1]` の `0.5` か `0.75`（近い方。同じ近さなら遅い方）。返り値は実際の値。`availableRates` が空のとき `1` を返す
  - `destroy` を2回呼んでも例外にならず、偽の `destroy` は1回だけ呼ばれる
  - `ytErrorKey` の対応表。案内文に `findBanned` が空
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段6②：YouTube プレーヤーの包み"`

### Task 4: 曲に YouTube を足す

**Files:**
- Modify: `src/screens/stage6List.js`, `src/data/copy.js`, `docs/device-checklist.md`
- Test: `tests/ui/stage6List.test.js`

**Interfaces:**
- Consumes: `parseYoutubeId`, `updateSong`, `addSong`, `getSong`
- 画面：
  - 曲を足す画面に「YouTube の アドレス（あとからでも 足せます）」の入力欄と、小さな注意 `ytNotice`「YouTube の プレーヤーを 読み込みます（YouTube に 接続します）。声は スマホの 外に 出ません。曲の ダウンロードは しません」
  - 曲ファイルも歌声だけのファイルも選ばず、YouTube のアドレスだけでも追加できる（`hasFile: false, hasVocal: false, durationSec: 0, youtubeId`）。何も入れなかったら今までの案内。アドレスが読み取れなければ `ytBadId`（曲は追加しない）
  - 曲の行に ▶（YouTube あり）の印。開くと、曲ファイルまたは歌声だけのファイルがあれば今までの曲の画面（`song`）、YouTube だけなら `songYt`
  - 既にある曲に YouTube を足す・変える・消す（行の「YouTube」ボタン → アドレス入力。空にして保存すると消える）。消しても `ytSections` は残す（アドレスをまた足したとき戻せる）
- Test 内容は下

- [ ] **Step 1: 失敗するテストを書く**
  - YouTube のアドレスだけで追加 → songs に `youtubeId` つき（`hasFile`・`hasVocal` は false）、`putFile` は呼ばれない、行に ▶、開くと `songYt` へ
  - 読み取れないアドレス → `ytBadId`、songs は空のまま。曲ファイルを選んでいてもアドレスが不正なら追加しない
  - 曲ファイル＋YouTube → `song` へ開く（今までの画面）。既存の曲に YouTube を足す → `youtubeId` が入る、消す → null、`ytSections` は残る
  - 追加画面に `ytNotice` が出る。新しい文に `findBanned` が空
  - 既存のテスト（曲ファイルだけ）が変わらず通る
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5:** `docs/device-checklist.md` に「YouTube だけの曲を足せる」「不正なアドレスで案内が出る」を1行ずつ足す
- [ ] **Step 6: Commit** `git commit -m "段6②：曲に YouTube を足す"`

### Task 5: YouTube で聞く（区間・くり返し・速さ）

**Files:**
- Create: `src/screens/stage6Yt.js`
- Modify: `src/main.js`（ルート `songYt` を登録。パラメーター `id`）, `src/screens/stage6Song.js`（YouTube もある曲に「YouTube で 練習」ボタン → `songYt`）
- Test: `tests/ui/stage6Yt.test.js`

**Interfaces:**
- Consumes: Task 1〜3（`getSong`、`saveSection(…, 'ytSections')`、`removeSection(…, 'ytSections')`、`loadYouTubeApi`、`createYtPlayer`、`ytErrorKey`、`createSongClock`、`loopAction`）
- Produces: `renderStage6Yt(root, params, deps = defaultDeps): () => void`。`deps = { loadYouTubeApi, createYtPlayer, setInterval, clearInterval, now, confirm }`
- 画面（歌う前まで）：
  - 見出し＝曲名、「YouTube」の印、注意 `ytEarphone`「曲に 合わせて 歌う ときは、イヤホンが 必要です」
  - 読み込み中の表示 → `loadYouTubeApi` 失敗（`YtTimeout`・`YtLoadError`）は `ytOffline`＋「もどる」。`createYtPlayer` の `YtPlayerError` は `ytErrorKey` に合う案内＋「もどる」（Review Focus 1・2）
  - プレーヤーの枠（`div`）、再生・止めるボタン、現在位置と長さ（「1:23 / 3:45」）
  - 区間：「ここを 始まりに」「ここを 終わりに」（そのときの `currentSec`）、「−0.5秒」「＋0.5秒」を始まり・終わりそれぞれに。始まり ＜ 終わり − 0.5秒、動画の長さの内側。区間が決まったら「▶ 区間を くり返す」（`pollMs` ごとに `loopAction`、`'seek'` で `seekTo(from)`、`'stop'` で止める）。速さ 1／0.75／0.5（`setRate` が返した実際の値を、ボタンの選びに反映）
  - 区間の保存・上書き・消す・「まだ 保存して いません」は、段6①の曲の画面（`stage6Song.js`）と同じ決まり・同じ文。`ytSections` に保存
  - 画面を離れるとき：くり返しのタイマーを止め、`player.destroy()`、`loadYouTubeApi` の待ちの結果を無視する（`disposed`）

- [ ] **Step 1: 失敗するテストを書く**（`deps` で偽のプレーヤー・偽のタイマーを渡す）
  - `loadYouTubeApi` が `YtTimeout` で reject → `ytOffline` が出て、プレーヤーは作られない（Review Focus 2）
  - `createYtPlayer` が `YtPlayerError(101)` → `ytNotEmbeddable`、`100` → `ytNotFound`（Review Focus 1）
  - 位置 10 秒で「ここを 始まりに」、12 秒で「ここを 終わりに」→ 区間 10〜12。終わりが始まりより前なら保存できず案内
  - 「区間を くり返す」→ `seekTo(10)` と `play`。位置が 12 を超えると `seekTo(10)`。くり返しを止めると `pause`
  - 速さ 0.75 → `setRate(0.75)` が呼ばれる。`setRate` が 0.5 を返したら 0.5 のボタンが選ばれた状態になる
  - 区間を保存 → `ytSections` に入り、`sections`（曲ファイルの区間）は変わらない。5つで保存すると案内。消す・上書きは段6①と同じ
  - `go('home')` で `destroy` が1回、タイマーが止まる。読み込み中に離れたあとで `loadYouTubeApi` が resolve しても何も作られない（Review Focus 4）
  - `stage6Song.js`：YouTube もある曲に「YouTube で 練習」が出て `songYt` へ行く。ない曲には出ない
  - 新しい文に `findBanned` が空
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段6②：YouTube で聞く"`

### Task 6: YouTube に合わせて歌う・結果

**Files:**
- Modify: `src/screens/stage6Yt.js`, `src/ui/pitchGraph.js`（`setRangeLines(low: number | null, high: number | null)`：声の地図の上下の端を `--muted` の点線で引く。null なら引かない）, `src/data/copy.js`
- Test: `tests/ui/stage6Yt.test.js`, `tests/ui/pitchGraph.test.js`

**Interfaces:**
- Consumes: Task 2（`createSongClock`、`stabilityOf`、`outsideRange`）、`createMicSession`（`release()` で閉じて再び開ける）、`lineToGhost`・`CONFIG.stage6.latencyMs`（段6①と同じ）、`createPitchGraph`（`windowMs = max(6000, 区間の長さ + leadIn)`。段6①の直しと同じ）、`addHistory`
- 画面：
  - 「● 歌う」（区間があるとき）：毎回 `earphoneAsk`（段6①の文）→「つけた」でマイクを開く → `max(0, 始まり − leadInSec)` へ `seekTo` して `play` → `pollMs` ごとに `currentSec()` を `clock.update` に渡し、マイクの各コマで `clock.estimate(now)` から区間の始まりを引いた ms ×（`latencyMs × rate` を引く）を読みの時刻にする。始まりより前のコマは捨てる。区間の終わり（`loopAction` が `'stop'`）で止めて `pause`、マイクを `release()`
  - 歌うあいだ、グラフには自分の線・前回の線（保存した区間なら `lastLine`）・声の地図の上下の線（`setRangeLines`）を出す
  - 結果：「ゆれの 目安：まっすぐ／ときどき ゆれる／よく ゆれる」（`none` のときは「声が 聞こえませんでした。もう一度 ためして みましょう」）、「声の 地図の 外：上に ○回・下に ○回」（0・0 なら出さない。あるときは「高い 所は 無理に のばさないで ください」）、前回との比較は線の重ねだけ（数字の点数は出さない）。保存した区間なら今回の線を `lastLine` に（`lastRatio` は null のまま）。上書き前の確認は段6①と同じ
  - 履歴：歌い終えた回だけ。`tries > 0` で `{ date, stage: 6, tries, successes: 0, value: null, songTitle, kind: 'yt' }`（`none` の回は数えない）。画面を離れる・隠す途中の回は入れない
  - 画面を離れる・隠す（`hidden`）：くり返しとマイクを止め、`destroy`（Task 5 と同じ）

- [ ] **Step 1: 失敗するテストを書く**
  - 「歌う」→ イヤホンの確認が出て、「つけた」までマイクは開かない。マイクは歌い終わると `release` される（Review Focus 4）
  - 同じ高さを流す → 「まっすぐ」。±40 セントでゆれる値 → 「よく ゆれる」。無音（null ばかり）→ 「声が 聞こえませんでした」で「ゆれ」は出ず、履歴に入らない（Review Focus 5）
  - 声の地図が 50〜60 で、65 を3コマ・45 を2コマ流す → 「上に 3回・下に 2回」と「無理に のばさない」。地図が無いときはこの行が出ない
  - 保存した区間で2回歌う → 2回目に前回の線（ghost）が `setGhost` に渡る。保存した区間の `lastLine` が更新され `lastRatio` は null
  - 歌い終えたら履歴に `kind: 'yt'`・`songTitle`・`tries: 1`。歌う途中で `go('home')` → 履歴に入らず、マイクが閉じ、`destroy` が呼ばれる
  - マイクの時刻：`clock.estimate` と `latencyMs` から作った読みの時刻が、速さ 0.5 でも区間の始まりを 0 とする（偽の時計で確かめる）
  - `pitchGraph.setRangeLines`：記録用の ctx で、`low`・`high` を渡すと破線が2本引かれ、null なら引かれない
  - 新しい文に `findBanned` が空
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段6②：YouTube に合わせて歌う"`

### Task 7: きろく・通しのテスト・確かめ表・引き継ぎ

**Files:**
- Modify: `src/screens/record.js`（`kind: 'yt'` の行：「好きな 曲：{曲名}（YouTube）　{回数}回 練習」。成功数・合いぐあいは出さない。曲ファイルの行と同じ日・同じ曲名でも別の行）, `docs/device-checklist.md`, `docs/HANDOFF.md`, `docs/safety/content-review.md`（段6②の文の表を足す。専門家チェックは controller が別に行う）
- Create: `e2e/stage6Yt.spec.js`
- Test: `tests/ui/record.test.js`

- [ ] **Step 1:** record：`kind: 'yt'` の履歴だけの日 →「好きな 曲：○○（YouTube）　2回 練習」。`value: null` で `NaN%` が出ない。曲ファイルの履歴が同じ日にあれば別の行になる
- [ ] **Step 2:** e2e（実際のネットにはつながない）：Playwright の `page.route('https://www.youtube.com/iframe_api', …)` で、偽の `window.YT.Player`（`onReady` を呼び、`getCurrentTime`・`seekTo`・`setPlaybackRate` などを動かす）を返すスクリプトを返す。流れ：段6 → 曲を足す（YouTube のアドレスだけ）→ `songYt` が開く → 偽プレーヤーが作られる → 「ここを 始まりに」「ここを 終わりに」→ 「区間を くり返す」→ 区間を保存 → 一覧に戻ると ▶ の曲がある。同じ spec に「`iframe_api` を `route.abort()` で断ると、`ytOffline` の案内が出る」を入れる
- [ ] **Step 3:** `npm test`、`npm run e2e`、`npm run build` がすべて通る
- [ ] **Step 4:** 実機の確かめ表に：YouTube が iPhone の Safari とホーム画面のアプリで再生できる／埋め込みが止められた動画で案内が出る／0.5倍・0.75倍が選べる（選べない速さのとき表示が実際の速さになる）／区間のくり返しの切れ目の長さ／**イヤホンで歌ったとき、YouTube の音量が小さくならないか（マイクを開いたあと）**／歌う間の自分の線のずれ（動画の位置の読みが粗くないか）／YouTube の公式ページ（IFrame API）の仕様（速さ・エラー番号）と `ytErrorKey` が合っているか／機内モードで案内が出る
- [ ] **Step 5:** HANDOFF に段6②の状態を書く。次は「アプリの中でキーを下げる機能（買った曲だけ）」。未確認：YouTube 公式仕様ページ（この環境から開けなかった）
- [ ] **Step 6: Commit** `git commit -m "段6②：きろく・通しのテスト・確かめ表・引き継ぎ"`
