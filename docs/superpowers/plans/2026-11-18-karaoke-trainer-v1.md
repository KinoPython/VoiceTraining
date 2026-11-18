# カラオケ音程トレーニング 最初の版（段1〜5）手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iPhone のブラウザで動き、聞き分け・声の地図・すべらせて止める・1音合わせ・短いメロディの5段で音程の土台を練習できる PWA を作る。

**Architecture:** 計算（音の高さ・判定・段の上げ下げ・点数）は `src/logic/` の DOM を使わない小さな関数にし、vitest で確かめる。音（合成音・マイク・聞き直し）は `src/audio/`、画面は `src/screens/`（1段1ファイル）、部品は `src/ui/`。記録は localStorage に1つの JSON で持つ。画面の切り替えは宅トレと同じ `#名前?キー=値` のルーター。

**Tech Stack:** Vite 5、素の JavaScript（ES modules）、Web Audio API、getUserMedia、[pitchy](https://www.npmjs.com/package/pitchy) 4.x（声の高さを測る。McLeod 方式）、vitest 2 ＋ jsdom、Playwright（chromium の偽マイク）、GitHub Pages（GitHub Actions）。

**Spec:** `docs/superpowers/specs/2026-11-18-karaoke-trainer-design.md`

## Global Constraints

- 文の決まりは `CLAUDE.md` のとおり：効果を言い切らない／病気の治療・予防をうたわない／責めない（「失敗」「不合格」「ダメ」を使わない。外れたら「少し 高め」「少し 低め」だけ）／連続日数を出さない
- 画面の文に出してはいけない言葉（テストで止める）：`治る` `治す` `必ず` `絶対` `失敗` `不合格` `ダメ` `連続` `日連続`
- マイクの声はスマホの外に送らない。録った声は保存しない（その場の聞き直しだけ。画面を離れたら捨てる）
- サーバーを使わない。外のファイル（フォント・CDN）を読み込まない。1〜5段は電波なしで動く
- iPhone の Safari（ホーム画面に追加した形も）で動く。音は必ずボタンを押したあとに鳴らし始める（iPhone の決まり）
- 色は `src/styles.css` の `:root` の色トークンだけで決め、`prefers-color-scheme: dark` で暗い色にする
- コードは短い関数と日本語の「なぜ」コメント。持ち主はプログラミング初心者
- 1段の中の数字（このあとの値）は `src/logic/config.js` の1か所に集める。実機で試して変えやすくするため

## Review Focus

1. **マイクを断った・マイクが無い・音の準備に失敗した**：アプリが止まらず、「設定アプリ → Safari → マイク」で許可する案内を出す（Task 9・11 のテスト）
2. **だまっている・息の音・まわりの雑音**：高さが無いものとして扱い、「できた」に数えない（Task 3・5 のテスト）
3. **測る仕組みが一瞬だけ1オクターブ跳ぶ**（よくある読みまちがい）：1回の跳びで線が乱れず、「帯の中」の時間が切れない（Task 3・5 のテスト）
4. **声の地図がおかしい**（幅が狭すぎる・一瞬の裏返りで高すぎる値）：はずれ値を落とし、狭いときは広げ、お手本は必ず幅の中に入る（Task 6 のテスト）
5. **練習の途中で画面を離れる・スマホを閉じる**：マイクと音を必ず止める（iPhone の上のマイクの印が消える）（Task 9・12 のテスト）

---

## ファイルの地図

| ファイル | 役目 |
|---|---|
| `src/logic/config.js` | 数字の目安を1か所に |
| `src/logic/notes.js` | 周波数⇔音の番号（MIDI）・セント・ドレミの名前・オクターブずれ |
| `src/logic/pitch.js` | 声の高さを測る（pitchy の包み）・ゆれをならす |
| `src/logic/ladder.js` | 段の上げ下げ（2回できたら1つ上、1回外れたら1つ下） |
| `src/logic/listenTrial.js` | 段1の問題を作る |
| `src/logic/hold.js` | 「帯の中に1秒いられたか」の判定 |
| `src/logic/range.js` | 声の地図のまとめ・お手本の高さを幅の中に入れる |
| `src/logic/targets.js` | 段3・4の目標の高さと帯の太さ |
| `src/logic/melodies.js` | 段5の練習メロディと点数 |
| `src/logic/recommend.js` | きょうのおすすめの段 |
| `src/logic/words.js` | 禁止の言葉のチェック（テスト用） |
| `src/storage/store.js` | 記録の保存・読み込み・バックアップ |
| `src/audio/tone.js` | 合成音を鳴らす |
| `src/audio/mic.js` | マイクを開く・閉じる・1コマずつ高さを渡す・聞き直し用の録音（メモリだけ） |
| `src/ui/pitchGraph.js` | 横に流れる線グラフと目標の帯（canvas） |
| `src/ui/keyboard.js` | 鍵盤の絵（SVG） |
| `src/ui/components.js` | ボタン・見出しなど小さな部品 |
| `src/data/tips.json` | 段ごとのコツ |
| `src/data/articles/*.json` | 体の使い方の短い記事 |
| `src/screens/*.js` | 画面（home・welcome・safety・warmup・stage1〜5・record・settings・article） |
| `src/router.js`・`src/main.js`・`src/styles.css` | 土台 |

---

### Task 1: 土台（Vite・ルーター・色・PWA・公開）

**Files:**
- Create: `package.json`, `vite.config.js`（`base: './'`）, `vitest.config.js`（jsdom・`tests/**/*.test.js`）, `playwright.config.js`（宅トレと同じ形。iphone＝`devices['iPhone 13']`＋chromium の1つだけ。`launchOptions.args` に `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`, `--use-file-for-fake-audio-capture=e2e/fixtures/a3.wav`）, `index.html`, `src/main.js`, `src/router.js`, `src/styles.css`, `src/screens/home.js`（仮の見出しだけ）, `public/manifest.webmanifest`（name「こえトレ」、short_name「こえトレ」、display standalone、アイコン 192/512 の PNG）, `public/sw.js`, `public/icons/`, `.github/workflows/pages.yml`, `.gitignore`（`node_modules` `dist` `test-results`）
- Test: `tests/router.test.js`

**Interfaces:**
- Produces: `register(name: string, render: (root: HTMLElement, params: URLSearchParams) => (void | (() => void)))`, `go(name: string, params?: object)`, `start(rootEl: HTMLElement)`, `resetRoutes()`（`src/router.js`）。render が関数を返したら、次の画面に移る前に必ず呼ぶ（マイクを止めるため）

- [ ] **Step 1:** `npm init`、`npm i -D vite@5 vitest@2 jsdom@25 @playwright/test@1.63.0`、`npm i pitchy@4`。scripts は宅トレと同じ（`dev` `build` `preview --port 4173` `test` `e2e: playwright test --trace off`）
- [ ] **Step 2: 失敗するテストを書く**（`tests/router.test.js`）
  - `test('#stage1 で stage1 の描画が呼ばれる')`：`register('stage1', fn)` → `location.hash = '#stage1?x=1'` → `fn` が root と `params.get('x') === '1'` で呼ばれる
  - `test('画面を移るとき前の画面の後始末が呼ばれる')`：render が返した `dispose` が、`go('home')` のあと1回呼ばれる
  - `test('知らない名前は home へ')`
- [ ] **Step 3:** `npx vitest run tests/router.test.js` → FAIL
- [ ] **Step 4:** ルーターを書く（宅トレ `src/router.js` の register/go/start/後始末だけを写す。見張り・リスナーは要らない）。`main.js` は home を登録して start。`styles.css` に `:root` の色トークン（`--bg --ink --muted --accent --band --band-ok --line --card`）と暗い色の `@media`。sw.js は宅トレと同じ「先に保存して、電波なしでも開く」形（ファイル一覧は build で作られる `dist` の中身を Vite の `generateBundle` で書き出すか、手で書く。作る人の判断）。本番だけ登録
- [ ] **Step 5:** `npx vitest run` → PASS、`npm run build` が通る
- [ ] **Step 6:** `pages.yml`：`main` に push したら `npm ci && npm run build` → `actions/upload-pages-artifact`（dist）→ `actions/deploy-pages`。README.md に「GitHub の Settings → Pages → Source を GitHub Actions にする」と書く（持ち主の作業）
- [ ] **Step 7: Commit** `git commit -m "土台：Vite・ルーター・色・PWA・公開の設定"`

### Task 2: 音の計算（notes.js・config.js・words.js）

**Files:**
- Create: `src/logic/notes.js`, `src/logic/config.js`, `src/logic/words.js`
- Test: `tests/logic/notes.test.js`, `tests/logic/words.test.js`

**Interfaces:**
- Produces（notes.js）:
  - `hzToMidi(hz: number): number`（小数のまま。A4=440Hz=69）
  - `midiToHz(midi: number): number`
  - `centsOff(sungMidi: number, targetMidi: number): number`（(sung−target)×100）
  - `foldOctave(cents: number): { cents: number, octaveShift: number }`（cents を −600 以上 600 未満にたたみ、何オクターブずらしたかを返す。例 1210 → {cents: 10, octaveShift: 1}）
  - `noteLabel(midi: number): string`（四捨五入した音を「ド」「ド#」…「シ」＋高さの番号。60 →「ド4」、61 →「ド#4」）
  - `gapLabel(semitones: number): string`（1「ドと ド#」 2「ドと レ」 3「ドと レ#」 4「ドと ミ」 5「ドと ファ」 6「ドと ファ#」 7「ドと ソ」 8「ドと ソ#」 9「ドと ラ」 10「ドと ラ#」 11「ドと シ」 12「ドと 上の ド」）
- Produces（config.js）：下の値をそのまま `export const CONFIG = {...}` に入れる

```js
export const CONFIG = {
  pitch: { minHz: 65, maxHz: 1050, minClarity: 0.85, minRms: 0.01, smoothFrames: 5 },
  defaultRange: { comfort: 55, low: 50, high: 60 }, // 測る前。男女どちらでもとどく真ん中あたり（G3 前後）
  ladder: { upAfter: 2, maxLevel: 10 },
  tolerance: [ { upTo: 2, cents: 100 }, { upTo: 5, cents: 50 }, { upTo: 10, cents: 30 } ], // レベルごとの帯の半分の太さ
  hold: { holdMs: 1000, gapMs: 150 },
  stage1: { startGap: 7, minGap: 1, maxGap: 12, trials: 20, toneMs: 600, pauseMs: 300, lastForResult: 6 },
  stage2: { comfortMs: 3000, comfortNeedMs: 1000, glideMs: 8000, lowPct: 5, highPct: 95, minWidth: 5 },
  stage3: { tryMs: 10000 },
  stage4: { toneMs: 1500, waitMs: 500, tryMs: 6000 },
  stage5: { noteMs: 800, skipMs: 250, passRatio: 0.6 },
  session: { minutes: 10 },
};
```
- Produces（words.js）：`BANNED: string[]`（Global Constraints の言葉）、`findBanned(text: string): string[]`

- [ ] **Step 1: 失敗するテストを書く**
  - `hzToMidi(440) === 69`、`hzToMidi(220) === 57`、`Math.abs(hzToMidi(261.63) - 60) < 0.01`、`midiToHz(69) === 440`
  - `centsOff(60.5, 60) === 50`
  - `foldOctave(1210)` → `{cents: 10, octaveShift: 1}`、`foldOctave(-1190)` → `{cents: 10, octaveShift: -1}`、`foldOctave(30)` → `{cents: 30, octaveShift: 0}`
  - `noteLabel(60) === 'ド4'`、`noteLabel(61) === 'ド#4'`、`noteLabel(57) === 'ラ3'`
  - `gapLabel(7) === 'ドと ソ'`、`gapLabel(12) === 'ドと 上の ド'`
  - `findBanned('音痴が 治る') ` → `['治る']`、`findBanned('少し 高め') ` → `[]`
- [ ] **Step 2:** `npx vitest run tests/logic` → FAIL
- [ ] **Step 3:** 書く
- [ ] **Step 4:** `npx vitest run tests/logic` → PASS
- [ ] **Step 5: Commit** `git commit -m "音の計算と数字の目安"`

### Task 3: 声の高さを測る（pitch.js）

**Files:**
- Create: `src/logic/pitch.js`
- Test: `tests/logic/pitch.test.js`

**Interfaces:**
- Consumes: `CONFIG.pitch`, `hzToMidi`
- Produces:
  - `detectPitch(samples: Float32Array, sampleRate: number): number | null`（MIDI の小数。高さが無い・自信が無いときは null）
  - `createSmoother(frames = CONFIG.pitch.smoothFrames): { push(midi: number | null): number | null, reset(): void }`

- [ ] **Step 1: 失敗するテストを書く**（音はテストの中で作る。`sine(hz, sr=44100, n=2048, amp=0.3)` のような小さな関数）
  - `test('220Hz の音は 57 前後')`：`|detectPitch(sine(220)) - 57| < 0.2`
  - `test('無音は null')`：`detectPitch(new Float32Array(2048)) === null`
  - `test('小さすぎる音は null')`：amp 0.005 → null（Review Focus 2）
  - `test('雑音は null')`：`Math.random()*2-1` を 0.3 倍 → null（Review Focus 2）
  - `test('範囲の外の高さは null')`：40Hz → null
  - `test('一瞬のオクターブ跳びはならされる')`：smoother に 57,57,69,57,57 → 最後の出力が 57（Review Focus 3）
  - `test('null が続けば null')`：null を3回 → null。1回だけの null のあとは前の値に近い値（中央値）が出る
- [ ] **Step 2:** FAIL を確かめる
- [ ] **Step 3:** `detectPitch` は「RMS が `minRms` 未満なら null → pitchy の `PitchDetector.forFloat32Array(n).findPitch(samples, sr)` → clarity が `minClarity` 未満、または hz が範囲外なら null → `hzToMidi`」。Smoother は直近 `frames` 個の中の null 以外の中央値。直近の半分より多くが null なら null
- [ ] **Step 4:** PASS を確かめる
- [ ] **Step 5: Commit** `git commit -m "声の高さを測る仕組み"`

### Task 4: 段の上げ下げと段1の問題（ladder.js・listenTrial.js）

**Files:**
- Create: `src/logic/ladder.js`, `src/logic/listenTrial.js`
- Test: `tests/logic/ladder.test.js`, `tests/logic/listenTrial.test.js`

**Interfaces:**
- Produces:
  - `createLadder({ level = 0, upAfter = 2, maxLevel = 10 }): { get level(): number, answer(ok: boolean): number }`（2回続けてできたら＋1、1回外れたら−1。0〜maxLevel にとどめる）
  - `gapForLevel(level: number): number`（`clamp(startGap - level, minGap, maxGap)`。段1は「レベルが上がる＝差が小さくなる」。最初は level 0 = 7半音）
  - `makeListenTrial(centerMidi: number, gap: number, rand = Math.random): { first: number, second: number, answer: 'high' | 'low' }`（first は center の ±2 の整数。second = first ± gap。2つとも 40〜76 に入るよう向きを選ぶ）
  - `listenResult(gaps: number[]): number`（最後の `lastForResult` 問の差の平均を四捨五入）

- [ ] **Step 1: 失敗するテストを書く**
  - ladder：○○ で level 1、○○× で 0、×だけでは 0 のまま、maxLevel を超えない
  - `gapForLevel(0) === 7`、`gapForLevel(6) === 1`、`gapForLevel(9) === 1`
  - makeListenTrial：1000回まわして、`Math.abs(second-first) === gap`、`answer` が second の向きと合う、2つとも 40〜76、high と low の両方が出る
  - `listenResult([7,6,6,5,5,4,4,3])` は `Math.round((6+5+5+4+4+3)/6) === 5`
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段の上げ下げと聞き分けの問題"`

### Task 5: 「帯の中に1秒」の判定（hold.js）

**Files:**
- Create: `src/logic/hold.js`
- Test: `tests/logic/hold.test.js`

**Interfaces:**
- Consumes: `centsOff`, `foldOctave`, `CONFIG.hold`
- Produces: `createHoldJudge({ targetMidi: number, toleranceCents: number, holdMs = 1000, gapMs = 150, allowOctave = false }): { update(midi: number | null, nowMs: number): { state: 'waiting' | 'inside' | 'done', direction: 'high' | 'low' | null, insideMs: number, octaveShift: number } }`
  - 帯の中にいる時間を積む。帯から出たら 0 に戻す。null（声が無い）が `gapMs` 以下なら切らない、それより長ければ 0 に戻す
  - `direction`：帯より上なら 'high'、下なら 'low'、中なら null、声が無ければ null
  - `allowOctave` のときは `foldOctave` した cents で見る。done になった時点の `octaveShift` を返す（画面で「1つ上の 高さで 合って いました」に使う）
  - 一度 done になったら、そのあとは done のまま

- [ ] **Step 1: 失敗するテストを書く**（16ms ごとに update を呼ぶ小さな関数 `feed(judge, midis, startMs)` を作る）
  - 目標 60・帯 100c：60.3 を 1000ms ぶん → done
  - 60.3 を 900ms → inside、`insideMs` が 900 前後
  - 帯の外 61.5 → direction 'high'、58.5 → 'low'
  - 60.3 を 500ms → null を 100ms → 60.3 を 500ms → done（短い切れ目は切らない）
  - 60.3 を 500ms → null を 300ms → 60.3 を 500ms → done ではない
  - 雑音のつもりで null ばかり → waiting のまま（Review Focus 2）
  - allowOctave：72.2 を 1000ms → done、octaveShift 1。allowOctave なし → done ではない、direction 'high'
  - 60.3 の途中に 1フレームだけ 61.8 → 切れる（1フレームの跳びは Task 3 のならしで消える前提。ここはならしたあとの値を受け取る）
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "帯の中に1秒いられたかの判定"`

### Task 6: 声の地図と目標（range.js・targets.js）

**Files:**
- Create: `src/logic/range.js`, `src/logic/targets.js`
- Test: `tests/logic/range.test.js`, `tests/logic/targets.test.js`

**Interfaces:**
- Produces（range.js）:
  - `comfortFrom(readings: (number | null)[], frameMs: number): number | null`（null 以外の時間が `comfortNeedMs` 未満なら null。それ以上なら中央値を四捨五入した整数）
  - `edgeFrom(readings: (number | null)[], side: 'low' | 'high'): number | null`（null を除いて、low は5パーセンタイル・high は95パーセンタイルを四捨五入。値が10個未満なら null）
  - `makeRange(comfort: number, low: number | null, high: number | null): { comfort, low, high, widened: boolean }`（low が無い・comfort より上なら comfort−3、high が無い・comfort より下なら comfort+3。high−low が `minWidth`(5) 未満なら comfort を中心に ±3 に広げ `widened: true`）
  - `clampToRange(midi: number, range): number`（low〜high に入れる）
- Produces（targets.js）:
  - `toleranceFor(level: number): number`（CONFIG.tolerance の表：0〜2 → 100、3〜5 → 50、6〜10 → 30）
  - `glideTarget(level: number, tryIndex: number, range): { targetMidi: number, startFrom: 'below' | 'above' }`（離す幅 = 2 + floor(level/2) 半音。level 0〜1 はいつも below。level 2 から tryIndex の偶数は below＝comfort より上の目標、奇数は above＝comfort より下の目標。clampToRange する）
  - `matchTarget(level: number, tryIndex: number, range, rand = Math.random): number`（comfort ± (1 + level) 半音の中の整数をくじで。clampToRange する）

- [ ] **Step 1: 失敗するテストを書く**
  - comfortFrom：57 前後を 2000ms ぶん（16ms ごと）→ 57。500ms ぶんだけ → null
  - edgeFrom：50〜62 の坂に、1つだけ 80（裏返り）をまぜる → high は 62 前後で 80 ではない（Review Focus 4）
  - makeRange(57, 55, 58) → 幅 3 なので `{low: 54, high: 60, widened: true}`（Review Focus 4）
  - makeRange(57, null, 70) → low 54
  - glideTarget(0, 0, {comfort:57, low:50, high:64}) → `{targetMidi: 59, startFrom: 'below'}`、glideTarget(4, 1, 同じ) → `{targetMidi: 53, startFrom: 'above'}`
  - matchTarget を 1000回：いつも range の中（Review Focus 4）、`|t - comfort| <= 1 + level`
  - toleranceFor(0) 100、(3) 50、(6) 30
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "声の地図のまとめと目標の高さ"`

### Task 7: 段5のメロディと点数（melodies.js）

**Files:**
- Create: `src/logic/melodies.js`
- Test: `tests/logic/melodies.test.js`

**Interfaces:**
- Produces:
  - `MELODIES: { id: string, steps: number[], level: number }[]`（steps は最初の音からの半音。アプリで作ったものだけ。下の表をそのまま入れる）

| level | id | steps | 名前（画面） |
|---|---|---|---|
| 0 | `do-re` | [0, 2] | ド→レ |
| 0 | `do-re-do` | [0, 2, 0] | ド→レ→ド |
| 1 | `do-re-mi` | [0, 2, 4] | ド→レ→ミ |
| 1 | `mi-re-do` | [4, 2, 0] | ミ→レ→ド |
| 2 | `do-mi` | [0, 4] | ド→ミ |
| 2 | `do-re-mi-re-do` | [0, 2, 4, 2, 0] | ド→レ→ミ→レ→ド |
| 3 | `do-mi-so` | [0, 4, 7] | ド→ミ→ソ |
| 3 | `so-mi-do` | [7, 4, 0] | ソ→ミ→ド |
| 4 | `do-fa-mi-re-do` | [0, 5, 4, 2, 0] | ド→ファ→ミ→レ→ド |
| 5 | `do-so-mi-do` | [0, 7, 4, 0] | ド→ソ→ミ→ド |

  - `pickMelody(level: number, rand = Math.random)`（`melody.level <= floor(level/2)` の中からくじ。いちばん新しく届いた level のものを半分の確率で）
  - `melodySegments(melody, range): { midi: number, startMs: number, endMs: number }[]`（最初の音 base は comfort−2。いちばん高い音が high を超えるなら下げ、いちばん低い音が low より下なら上げる。両方むりなら low に合わせる。1音 `noteMs`）
  - `scoreMelody(readings: { t: number, midi: number | null }[], segments, toleranceCents: number, allowOctave = true): number`（各音の最初の `skipMs` を除いた時間の中で、帯の中にいた読みの割合。0〜1）

- [ ] **Step 1: 失敗するテストを書く**
  - 表の10個がそろっている、全部 id がちがう
  - melodySegments(`do-mi-so`, {comfort:57, low:50, high:62}) → midi [55, 59, 62]、startMs [0, 800, 1600]
  - melodySegments(`do-mi-so`, {comfort:57, low:54, high:58}) → いちばん低い音が 54（両方むり → low に合わせる）
  - scoreMelody：ぴったり歌った読み → 1、全部 1.5半音ずれ → 0、半分の音だけ合う → 0.5 前後、各音の最初の 250ms だけずれる → 1、1オクターブ上でぴったり（allowOctave）→ 1
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "練習メロディと合いぐあい"`

### Task 8: 記録の保存とバックアップ（store.js・recommend.js）

**Files:**
- Create: `src/storage/store.js`, `src/logic/recommend.js`
- Test: `tests/storage/store.test.js`, `tests/logic/recommend.test.js`

**Interfaces:**
- Produces（store.js。localStorage のキー `koetore.v1`。読み書きはすべて try/catch し、こわれていたら初めの形に戻す）:
  - 形：`{ version: 1, range: { comfort, low, high, widened, measuredOn: 'YYYY-MM-DD' } | null, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: { date: 'YYYY-MM-DD', stage: 1|2|3|4|5, tries: number, successes: number, value: number | null }[], welcomed: false }`
    - history の `value`：段1は聞き分けられた差（半音）、段2は幅（high−low）、段5は合いぐあいの平均（0〜1）、段3・4は null
  - `loadState(): State`、`saveRange(range)`、`setLevel(stage: 's1'|'s3'|'s4'|'s5', level: number)`、`addHistory(entry)`、`setWelcomed()`
  - `exportBackup(): string`（JSON 文字列）、`importBackup(text: string): { ok: true } | { ok: false, reason: string }`（version が 1 でない・形がちがうものは断り、前の記録は変えない）
  - `requestPersist()`（`navigator.storage?.persist?.()` を呼ぶだけ。無ければ何もしない）
- Produces（recommend.js）：`recommendStage(state): 1|2|3|4|5`（段1を1回もしていない → 1。range が null → 2。段3の level が 4 未満 → 3。段4の level が 4 未満 → 4。それ以外 → 5）

- [ ] **Step 1: 失敗するテストを書く**
  - 何も無いとき loadState は初めの形
  - localStorage に `'{こわれた'` → 初めの形が返り、例外にならない
  - saveRange → loadState に残る。addHistory を3回 → history の長さ 3
  - exportBackup → 消す → importBackup → 同じ中身
  - importBackup('{"version":2}') → ok false、前の中身はそのまま
  - recommendStage：初め → 1、段1の history あり → 2、range あり・s3=0 → 3、s3=4・s4=4 → 5
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "記録の保存・バックアップ・きょうのおすすめ"`

### Task 9: 音を鳴らす・マイク（tone.js・mic.js）

**Files:**
- Create: `src/audio/tone.js`, `src/audio/mic.js`
- Test: `tests/audio/mic.test.js`, `tests/audio/tone.test.js`

**Interfaces:**
- Produces（tone.js）:
  - `getAudioContext(): AudioContext`（1つだけ作って使い回す。`resume()` もここで）
  - `playNote(midi: number, durationMs: number, whenMs = 0): Promise<void>`（三角波。立ち上がり 30ms・消え際 80ms の音量の形。鳴り終わりで resolve）
  - `playSequence(notes: { midi: number, durationMs: number }[], pauseMs = 0): Promise<void>`
  - `stopAll()`
- Produces（mic.js）:
  - `openMic(): Promise<{ ok: true, mic: Mic } | { ok: false, reason: 'denied' | 'nodevice' | 'unsupported' | 'other' }>`（getUserMedia `{ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }`。NotAllowedError → denied、NotFoundError → nodevice、mediaDevices が無い → unsupported）
  - `Mic`：`onFrame(cb: (midi: number | null, nowMs: number) => void)`（requestAnimationFrame ごとに AnalyserNode（fftSize 2048）の波 → `detectPitch` → smoother → cb）、`startTake()` / `stopTake(): Promise<string | null>`（MediaRecorder でメモリに録り、`URL.createObjectURL` を返す。MediaRecorder が無ければ null）、`close()`（rAF を止める・全トラック `stop()`・録音の URL を `revokeObjectURL`）
  - 画面を隠した（`visibilitychange` で hidden）ら、mic.js が自分で close する（Review Focus 5）

- [ ] **Step 1: 失敗するテストを書く**（`navigator.mediaDevices.getUserMedia` と AudioContext は偽物に差しかえる）
  - getUserMedia が `NotAllowedError` で断る → `{ok:false, reason:'denied'}`（Review Focus 1）
  - `navigator.mediaDevices` が無い → `'unsupported'`
  - close() で、偽のトラックの `stop` がすべて呼ばれる（Review Focus 5）
  - `document.visibilityState = 'hidden'` ＋ `visibilitychange` → トラックの stop が呼ばれる（Review Focus 5）
  - close() を2回呼んでも例外にならない
  - tone：偽の AudioContext で playNote(69, 500) が、周波数 440 のオシレーターを start/stop する
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "合成音とマイク"`

### Task 10: 線グラフと鍵盤（pitchGraph.js・keyboard.js）

**Files:**
- Create: `src/ui/pitchGraph.js`, `src/ui/keyboard.js`
- Test: `tests/ui/pitchGraph.test.js`, `tests/ui/keyboard.test.js`

**Interfaces:**
- Produces（pitchGraph.js）:
  - `midiToY(midi: number, minMidi: number, maxMidi: number, height: number): number`（高い音ほど上。minMidi → height、maxMidi → 0）
  - `createPitchGraph(canvas: HTMLCanvasElement, { minMidi: number, maxMidi: number, windowMs = 6000 }): { push(nowMs: number, midi: number | null): void, setBands(bands: { midi: number, cents: number, startMs?: number, endMs?: number }[]): void, setOk(ok: boolean): void, clear(): void }`
  - 縦の目盛り：ド（C）ごとに横線と「ド3」などの文字。帯は `--band` の色、できたら `--band-ok`。声の線は `--line`。null の所は線を切る。色は `getComputedStyle` で `:root` のトークンから読む
  - 段3・4の帯は時間の指定なし（ずっと横に）。段5は startMs/endMs つきで階段状
- Produces（keyboard.js）：`renderKeyboard({ fromMidi: number, toMidi: number, marks: { midi: number, kind: 'a' | 'b' | 'range' | 'comfort' }[] }): SVGElement`（白鍵・黒鍵。marks の鍵に色。各白鍵の下に「ド」などの文字）

- [ ] **Step 1: 失敗するテストを書く**
  - `midiToY(48, 48, 72, 240) === 240`、`midiToY(72, 48, 72, 240) === 0`、`midiToY(60, 48, 72, 240) === 120`
  - renderKeyboard({fromMidi:60, toMidi:72}) の白鍵は 8個、黒鍵は 5個
  - marks に `{midi: 64, kind:'b'}` → その鍵に `data-kind="b"`
  - createPitchGraph は jsdom で canvas の getContext が無くても例外にならない（何もしない）
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "線グラフと鍵盤の絵"`

### Task 11: はじめての画面・安全・ホーム・準備（welcome・safety・home・warmup）

**Files:**
- Create: `src/screens/welcome.js`, `src/screens/safety.js`, `src/screens/warmup.js`, `src/ui/components.js`, `src/ui/micGuide.js`
- Modify: `src/screens/home.js`, `src/main.js`
- Test: `tests/ui/home.test.js`, `tests/ui/welcome.test.js`, `tests/ui/micGuide.test.js`

**Interfaces:**
- Consumes: `loadState`, `setWelcomed`, `recommendStage`, `openMic`
- Produces: `renderMicGuide(root: HTMLElement, reason: 'denied' | 'nodevice' | 'unsupported' | 'other'): void`（段2〜5の画面がマイクを開けなかったときに使う）、`button(label: string, onClick): HTMLButtonElement`, `heading(text: string): HTMLElement`, `note(text: string): HTMLElement`

画面の中身（文はこのまま）:
- **welcome**（`welcomed` が false のとき、どこへ行っても先にここ）：「こえトレへ ようこそ」／「音の 高さを 聞き分ける 練習と、声を 高さに 合わせる 練習が できます。」／安全の一言（下の3つ）／「マイクを 使います。声は この スマホの 中だけで 使い、外には 送りません。録った 声も 保存しません。」／ボタン「はじめる」→ setWelcomed → home
- **安全の一言**（welcome・safety・warmup に出す）：「苦しい・痛いと 感じたら、すぐ やめましょう。」「のどの 痛みや 声がれが 続くときは、耳鼻咽喉科で 相談して ください。」「この アプリは 医療・診断の 代わりでは ありません。うまく なる 早さには 個人差が あります。」
- **home**：見出し「きょうの おすすめ」＋おすすめの段のカード（段の名前と1行の説明）＋「▶ はじめる」（まず warmup、そのあと その段へ）／「1回 10分くらいが 目安です。のどを 休める 日が あっても 大丈夫。」／ほかの段の一覧（5つ、どれでも選べる。段2をまだ測っていないときは段3〜5に「先に 声の 地図を 測ると、あなたの 高さで 練習できます」の一言）／下に「きろく」「せってい」「安全の こと」「読みもの」
- **warmup**（1〜2分）：①「口を 閉じて『んー』と 楽な 高さで 5秒」×2 ②「『うー』で 低い 所から ゆっくり 上げて 下げる（サイレン）」×2。各手順に「つぎへ」と「とばす」。最後に「練習へ」
- **micGuide**：denied →「マイクが 使えません。iPhone の『設定』→『Safari』→『マイク』で『許可』に して、もう一度 開いて ください。」／nodevice →「マイクが 見つかりません。イヤホンの マイクなどを つないで ください。」／unsupported・other →「この ブラウザでは マイクが 使えません。iPhone の Safari で 開いて ください。」＋「ホームへ」

- [ ] **Step 1: 失敗するテストを書く**
  - welcomed false で `#home` → welcome が出る。「はじめる」→ home、loadState().welcomed が true
  - home：初めの state ではおすすめが段1、range ありで段3
  - renderMicGuide(root, 'denied') に「設定」「マイク」の文字（Review Focus 1）
  - welcome・safety・home・warmup の textContent に `findBanned` が空
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "はじめての画面・安全・ホーム・準備"`

### Task 12: 段1 聞き分け（stage1.js）

**Files:**
- Create: `src/screens/stage1.js`
- Test: `tests/ui/stage1.test.js`

**Interfaces:**
- Consumes: `createLadder`, `gapForLevel`, `makeListenTrial`, `listenResult`, `playSequence`, `renderKeyboard`, `gapLabel`, `loadState`, `setLevel`, `addHistory`, `CONFIG.stage1`
- Produces: `renderStage1(root, params): () => void`（後始末で `stopAll()`）

流れ：「2つの 音を 鳴らします。2つ目は 高い？ 低い？」→「▶ 聞く」→ 2音（`toneMs`・間 `pauseMs`）→ ボタン「高い ↑」「低い ↓」（音が鳴り終わるまで押せない。「もう一度 聞く」はいつでも）→ 答えのあと：当たり「当たり！」／外れ「答えは『高い』でした。もう一度 聞いて みましょう」→ 鍵盤に1つ目（a）・2つ目（b）の印、「ゆっくり 聞く」（各 1200ms・間 600ms）→「つぎへ」。中心の高さは range.comfort（無ければ defaultRange.comfort）。レベルは `levels.s1` から始め、終わりに保存。`trials` 問で終わり：「いま 聞き分けられる 差の 目安：{gapLabel}」と鍵盤、addHistory（value＝listenResult）。途中の「おわる」でも、答えた問があれば記録する

- [ ] **Step 1: 失敗するテストを書く**（playSequence はすぐ resolve する偽物に差しかえ、rand を固定）
  - 「▶ 聞く」を押すまで答えのボタンは disabled
  - 正しい答えを2回 → 次の問の差が 6
  - 20問答える → 結果の画面に「いま 聞き分けられる 差の 目安」、history に stage 1 が1つ
  - 画面を home へ移す → `stopAll` が呼ばれる（Review Focus 5）
  - 外れの文に「失敗」「ダメ」が無い（findBanned が空）
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段1 聞き分け"`

### Task 13: 段2 声の地図（stage2.js）

**Files:**
- Create: `src/screens/stage2.js`
- Test: `tests/ui/stage2.test.js`

**Interfaces:**
- Consumes: `openMic`, `renderMicGuide`, `createPitchGraph`, `comfortFrom`, `edgeFrom`, `makeRange`, `saveRange`, `addHistory`, `renderKeyboard`, `noteLabel`, `CONFIG.stage2`
- Produces: `renderStage2(root, params): () => void`（後始末で mic.close）

流れ：「声の 高さを 測るため、マイクを 使います」→「マイクを ひらく」（ボタンを押してから openMic。ok でなければ renderMicGuide）→ ①「いちばん 楽な 声で『んー』を 3秒」（`comfortMs` 録る。線グラフに声。足りなければ「もう少し 長く 声を 出して みましょう」でやり直し）→ ②「楽な 高さから、ゆっくり 下げて いきます。苦しく ない 所まで」（`glideMs`）→ ③「楽な 高さから、ゆっくり 上げて いきます。苦しく なる 手前で 止めて ください。無理に 高い 所を 出さなくて 大丈夫です。」（`glideMs`）→ 結果：鍵盤に range と comfort、「楽な 高さ：{noteLabel}」「出せる 幅：{low}〜{high}」。`widened` なら「今回は 幅を 少し 広めに しました。あとで 測りなおせます」。saveRange、addHistory（value＝high−low）。各手順に「やり直す」

- [ ] **Step 1: 失敗するテストを書く**（openMic を偽物に。onFrame にテストから値を流す）
  - openMic が denied → 案内の文が出る（Review Focus 1）
  - ①に 57 を 3秒ぶん、②に 57→50 の坂、③に 57→63 の坂 → saveRange が `{comfort:57, low:50, high:63}` 前後で呼ばれる
  - ①に null ばかり → 「もう少し 長く」が出て、次へ進まない（Review Focus 2）
  - ③の坂に 1フレームだけ 80 → high は 63 前後（Review Focus 4）
  - 移ると mic.close が呼ばれる（Review Focus 5）
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段2 声の地図"`

### Task 14: 段3 すべらせて止める（stage3.js）

**Files:**
- Create: `src/screens/stage3.js`, `src/ui/practiceLoop.js`
- Test: `tests/ui/stage3.test.js`

**Interfaces:**
- Consumes: `openMic`, `renderMicGuide`, `createPitchGraph`, `createHoldJudge`, `glideTarget`, `toleranceFor`, `createLadder`, `playNote`, `noteLabel`, `loadState`, `setLevel`, `addHistory`, tips（Task 18 が作るまでは空の配列でよい）
- Produces（practiceLoop.js。段3・4・5で使い回す）：`runTry({ mic, graph, judge, tryMs, onUpdate }): Promise<{ done: boolean, octaveShift: number }>`（`tryMs` の間 mic の高さを graph と judge に流す。done で早めに終わる。画面の後始末で止められるよう `cancel()` も返す形にする。正確な形は作る人の判断で、段3〜5 が同じものを使うこと）

流れ：マイクをひらく（段2と同じ）→ 1回ごと：目標の帯を出す。below なら「帯より 下から『うー』と ゆっくり 上げて、帯の 中で 止めて ください」、above なら「帯より 上から ゆっくり 下げて」。「▶ 目標の 音を 聞く」で目標の音を 1000ms 鳴らせる（鳴っている間は判定しない）→「はじめる」→ `tryMs` の間 判定（allowOctave false）。帯の外では帯の上に「少し 高め ↓」「少し 低め ↑」→ done：「できた！」（帯が `--band-ok`）／時間切れ：「おしい！ もう一度 ためして みましょう」→ ladder に答え → 次へ。「おわる」でその日の tries・successes を addHistory、level を保存。1回ごとに、段のコツを1つ出す。range が無ければ defaultRange を使い、上の一言（段2を先に）を出す

- [ ] **Step 1: 失敗するテストを書く**
  - 帯の中の値を 1000ms 流す →「できた！」、successes が1つ増える
  - 帯より上の値 →「少し 高め」が出る
  - 2回できる → 次の目標が level 1 のもの
  - tryMs ぶん null → 「おしい」、ladder は下がる（level 0 のままを確かめる）（Review Focus 2）
  - 目標の音を鳴らしている間に帯の中の値を流しても、できたに数えない
  - 移ると mic.close と stopAll（Review Focus 5）
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段3 すべらせて止める"`

### Task 15: 段4 1音合わせ（stage4.js）

**Files:**
- Create: `src/screens/stage4.js`
- Test: `tests/ui/stage4.test.js`

**Interfaces:**
- Consumes: Task 14 の `runTry` ほか、`matchTarget`、`mic.startTake / stopTake`、`playNote`
- Produces: `renderStage4(root, params): () => void`

流れ：1回ごと：「お手本を 聞いて、同じ 高さで『んー』か『あー』」→「▶ はじめる」→ お手本 `toneMs` → `waitMs` 待つ（この間は判定しない。イヤホンでもスピーカーでも、お手本の音を自分の声と取りちがえないため）→ 録音を始め、`tryMs` 判定（allowOctave true）→ 結果：「できた！」。octaveShift が ±1 以上なら「1つ 上の 高さで 合って いました」／「1つ 下の 高さで 合って いました」を添える。時間切れは「おしい！」＋そのときの向き（「少し 低めでした」など）→ 聞き直しのボタン「お手本」「自分の 声」「続けて 聞く」（自分の声は stopTake の URL を `<audio>` で。次の回に進む・画面を離れるときに revoke）→「つぎへ」

- [ ] **Step 1: 失敗するテストを書く**
  - お手本が鳴っている間と `waitMs` の間に帯の中の値を流しても数えない
  - 目標＋12 の値を 1000ms →「できた！」と「1つ 上の 高さで」
  - stopTake が null（録音できない）→「自分の 声」「続けて 聞く」のボタンは出さない、ほかは動く
  - 「つぎへ」で前の録音の URL が revoke される
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段4 1音合わせ"`

### Task 16: 段5 短いメロディ（stage5.js）

**Files:**
- Create: `src/screens/stage5.js`
- Test: `tests/ui/stage5.test.js`

**Interfaces:**
- Consumes: `pickMelody`, `melodySegments`, `scoreMelody`, `playSequence`, `createPitchGraph`（setBands に startMs/endMs つき）, `toleranceFor`, `createLadder`, `openMic`
- Produces: `renderStage5(root, params): () => void`

流れ：メロディの名前（例「ド→レ→ミ」）→「▶ お手本」（線グラフに階段の帯と、いま鳴っている音の印）→「歌う」：1拍分（`noteMs`）の「3・2・1」の合図のあと、帯が時間どおりに流れ、そこに声の線（お手本は鳴らさない）→ 結果：「いまの 合いぐあい：{割合}%（目安）」。`passRatio` 以上で「できた！」と ladder に○、未満は「おしい！ お手本を もう一度 聞いて みましょう」と×。どの音がずれたかを音ごとに「高め／低め／合って いた」で並べる → 「もう一度」「つぎの メロディ」

- [ ] **Step 1: 失敗するテストを書く**
  - お手本どおりの値を流す → 「できた！」と 100% 前後
  - 2つ目の音だけ 1.5半音上 → 2つ目に「高め」
  - 結果の文に「点」「採点」「不合格」が無い（目安として出す。findBanned も空）
  - 移ると mic.close と stopAll
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "段5 短いメロディ"`

### Task 17: きろくと設定（record.js・settings.js）

**Files:**
- Create: `src/screens/record.js`, `src/screens/settings.js`
- Test: `tests/ui/record.test.js`, `tests/ui/settings.test.js`

**Interfaces:**
- Consumes: `loadState`, `exportBackup`, `importBackup`, `requestPersist`, `renderKeyboard`, `gapLabel`
- Produces: `renderRecord`, `renderSettings`

- **きろく**：①聞き分けの差の変化（日ごとのいちばん小さい value の折れ線。下に行くほど細かく聞き分けられる、と軸に書く。数が1つなら点だけ）②いまの声の地図（鍵盤）③日ごとの一覧（日付・段・「○回 中 ○回 できた」・段5は合いぐあいの平均）。空のときは「練習すると、ここに 記録が 出ます」。下がった日を責める言葉・連続日数は出さない
- **せってい**：「声の 地図を 測りなおす」（段2へ）、「記録を ファイルに 書き出す」（JSON を `koetore-backup-YYYY-MM-DD.json` で保存）、「ファイルから 読み込む」（失敗なら「この ファイルは 読み込めません」）、「ホーム画面に 追加すると、記録が 消えにくく なります」の案内、「安全の こと」へのリンク、「クレジット」（pitchy のライセンス）

- [ ] **Step 1: 失敗するテストを書く**
  - history が空 → 「練習すると、ここに」
  - 段1の history 3日ぶん → 折れ線の点が3つ（SVG の circle が3つ）
  - 書き出し → 読み込み で同じ中身。こわれたファイル →「読み込めません」で記録は変わらない
  - きろく・せっていの文に findBanned が空、「連続」が無い
- [ ] **Step 2〜4:** FAIL → 書く → PASS
- [ ] **Step 5: Commit** `git commit -m "きろくと設定"`

### Task 18: コツと読みもの（tips.json・articles）

**Files:**
- Create: `src/data/tips.json`, `src/data/articles/posture.json`, `src/data/articles/breath.json`, `src/data/articles/relax.json`, `src/data/articles/pitch-ear.json`, `src/screens/article.js`, `docs/safety/content-review.md`
- Modify: `src/screens/stage3.js`〜`stage5.js`, `src/screens/home.js`（読みものの一覧）
- Test: `tests/content.test.js`

**Interfaces:**
- Produces:
  - tips.json：`{ "s1": string[], "s2": string[], "s3": string[], "s4": string[], "s5": string[] }`（各段 3〜6個、1つ 40字まで。例 s3「上げる ときは、坂道を そっと 登るように」「力むと 上がりすぎ やすいと いわれて います」）
  - 記事：`{ id, title, summary, body: string[], today: string[], cautions: string[], sources: { title, url, publisher }[], updatedOn: 'YYYY-MM-DD' }`
    - posture（姿勢）、breath（息の使い方）、relax（のどの力みを抜く）、pitch-ear（音程が合わない理由と、練習で伸びるといわれていること）

- [ ] **Step 1: 失敗するテストを書く**（`tests/content.test.js`）
  - tips の5つの段がそろい、各 3〜6個、40字まで
  - 記事4本がそろい、sources が1つ以上、各 url が `https://` で始まる、cautions に「耳鼻咽喉科」を含む文がある
  - tips と記事のすべての文に findBanned が空
- [ ] **Step 2:** FAIL を確かめる
- [ ] **Step 3:** 文を書く。記事の根拠は WebSearch で公的機関・学会・大学・査読論文の出典を確かめ、言い切らない（「〜と いわれて います」）。出典が見つからない話は書かない
- [ ] **Step 4:** PASS を確かめる
- [ ] **Step 5:** 声の専門家（ボイストレーナー・言語聴覚士）の目線の AI チェックをサブエージェントで1回行い、指摘と直したことを `docs/safety/content-review.md` に表で残す（宅トレと同じく、人の専門家の確認の代わり）
- [ ] **Step 6: Commit** `git commit -m "段ごとのコツと読みもの"`

### Task 19: 画面の流れのテスト・実機の確かめ表・引き継ぎメモ

**Files:**
- Create: `e2e/fixtures/a3.wav`（`scripts/make-fixture.mjs` で作る：220Hz の正弦波 10秒、16bit 44.1kHz mono）, `scripts/make-fixture.mjs`, `e2e/flow.spec.js`, `e2e/offline.spec.js`, `docs/device-checklist.md`, `docs/HANDOFF.md`, `README.md`（追記）

- [ ] **Step 1:** `node scripts/make-fixture.mjs` で wav を作り、コミットに入れる
- [ ] **Step 2: テストを書く**
  - flow：はじめて開く → welcome →「はじめる」→ home のおすすめが段1 → 段1で20問答える → きろくに1件
  - flow：段2を最後まで（偽マイクは 220Hz ＝ 57 なので、comfort 57、幅は広げた値 54〜60 になる）→ home のおすすめが段3
  - flow：段3で目標を 57 にそろえた状態（store に `range {comfort:55, low:50, high:60}`、level 0 → 目標 57）で「できた！」が出る
  - offline：1回開いたあと `context.setOffline(true)` → 再読み込み → home が出る、段1が鳴らせる画面まで進める
- [ ] **Step 3:** `npm run e2e` → PASS
- [ ] **Step 4:** `docs/device-checklist.md`（iPhone 実機の確かめ）：Safari とホーム画面の両方で、マイクの許可・断ったときの案内・イヤホン／スピーカー・音が鳴る（マナーモードのときも含む）・線グラフの遅れ・画面を閉じたらマイクの印が消える・電波なし
- [ ] **Step 5:** `docs/HANDOFF.md`（いまの状態・大事な資料・次の版＝段6 YouTube）。README に「Pages の設定（持ち主の作業）」と「`main` に入れると公開される」
- [ ] **Step 6:** `npm test` と `npm run e2e` がすべて PASS
- [ ] **Step 7: Commit** `git commit -m "画面の流れのテスト・実機の確かめ表・引き継ぎメモ"`
