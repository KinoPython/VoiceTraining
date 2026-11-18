// 段5 短いメロディ：お手本のメロディを聞いて、同じ高さの流れで歌う（お手本は歌っている間は鳴らさない）
import { go } from '../router.js';
import { button, heading, note } from '../ui/components.js';
import { createPitchGraph } from '../ui/pitchGraph.js';
import { createMicSession } from '../ui/practiceLoop.js';
import { openMic } from '../audio/mic.js';
import { playNote, stopAll } from '../audio/tone.js';
import { toleranceFor } from '../logic/targets.js';
import { createLadder } from '../logic/ladder.js';
import { pickMelody, melodySegments, scoreMelody, noteVerdicts } from '../logic/melodies.js';
import { noteLabel } from '../logic/notes.js';
import { CONFIG } from '../logic/config.js';
import { todayString } from '../logic/today.js';
import { loadState, setLevel, addHistory } from '../storage/store.js';
import { MAP_FIRST_HINT } from '../data/copy.js';
import tips from '../data/tips.json';

const defaultDeps = {
  openMic,
  playNote,
  stopAll,
  // 「3・2・1」の1拍ぶんの待ち
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  rand: Math.random,
};

const TEXT = {
  intro: 'お手本の メロディを 聞いて、同じ 高さの 流れで 歌う 練習です。マイクを 使います',
  guide: 'お手本を 聞いてから、『ら』や『あー』で 歌って みましょう',
  listening: 'お手本を 聞いて います…',
  go: '声を 出して ください',
  ok: 'できた！',
  close: 'おしい！ お手本を もう一度 聞いて みましょう',
  stopped: 'マイクが 止まりました。',
};

const VERDICT_TEXT = { ok: '合って いた', high: '高め', low: '低め', none: '声が 聞こえませんでした' };
// 歌い終わりの声をひろうための余白
const TAIL_MS = 300;

export function renderStage5(root, params, deps = defaultDeps) {
  const d = { ...defaultDeps, ...deps };
  const state = loadState();
  const hasRange = state.range !== null;
  const range = state.range ?? CONFIG.defaultRange;
  const ladder = createLadder({ level: state.levels.s5 });
  const scores = []; // 回ごとの合いぐあい（0〜1）
  let tries = 0;
  let successes = 0;
  let saved = false;
  let disposed = false;
  let ended = false;
  let melody = pickMelody(ladder.level, d.rand);
  let runId = 0; // お手本・歌うを始めるたびに増やす。古い処理の続きを止める印
  let cancelSing = null;

  const title = () => heading('短い メロディ');

  // 今日の分を記録する（二重に書かない）。回数が 0 なら履歴は残さない
  function save() {
    if (saved) return;
    saved = true;
    setLevel('s5', ladder.level);
    if (tries > 0) {
      const average = scores.reduce((a, b) => a + b, 0) / scores.length;
      addHistory({ date: todayString(), stage: 5, tries, successes, value: Math.round(average * 100) / 100 });
    }
  }

  function stopEverything() {
    runId += 1;
    if (cancelSing) cancelSing();
    d.stopAll();
  }

  function finishSession() {
    ended = true;
    stopEverything();
    save();
    go('home');
  }

  const session = createMicSession({
    openMic: (...args) => d.openMic(...args),
    root,
    onReady: () => showMelody(),
    onHidden: showStopped,
  });

  function showIntro() {
    const items = [title()];
    if (!hasRange) items.push(note(MAP_FIRST_HINT), button('声の 地図へ', () => go('stage2')));
    items.push(note(TEXT.intro), button('マイクを ひらく', () => session.open()));
    root.replaceChildren(...items);
  }

  function showStopped() {
    stopEverything();
    root.replaceChildren(title(), note(TEXT.stopped), button('もう一度 マイクを ひらく', () => session.open()));
  }

  function tipNote() {
    const list = tips.s5 ?? [];
    return list.length ? [note(list[tries % list.length])] : [];
  }

  // 帯を「歌いはじめの時刻 offsetMs」からの階段にして置く
  function placeBands(graph, segments, tolerance, offsetMs) {
    graph.setBands(segments.map((s) => ({ midi: s.midi, cents: tolerance, startMs: s.startMs + offsetMs, endMs: s.endMs + offsetMs })));
  }

  function showMelody() {
    stopEverything();
    const mic = session.mic;
    const segments = melodySegments(melody, range);
    const tolerance = toleranceFor(ladder.level);
    const totalMs = segments[segments.length - 1].endMs;
    const midis = segments.map((s) => s.midi);
    const canvas = document.createElement('canvas');
    const graph = createPitchGraph(canvas, { minMidi: Math.min(...midis) - 4, maxMidi: Math.max(...midis) + 4 });
    const status = note(TEXT.guide);
    const resultBox = document.createElement('div');
    let busy = false;

    // お手本を見せる前の階段（時計を totalMs に進めて、全体が見えるようにする）
    function showStaircase() {
      graph.clear();
      graph.push(totalMs, null);
      placeBands(graph, segments, tolerance, 0);
    }

    // お手本：1音ずつ鳴らし、鳴っている音を線グラフに印として描く
    async function playModel() {
      if (busy) return;
      busy = true;
      const myRun = ++runId;
      showStaircase();
      status.textContent = TEXT.listening;
      for (const seg of segments) {
        graph.push(seg.startMs, seg.midi);
        try {
          await d.playNote(seg.midi, CONFIG.stage5.noteMs);
        } catch {
          // 鳴らせなくても続けられる
        }
        if (myRun !== runId || disposed || ended) return;
        graph.push(seg.endMs - 1, seg.midi);
      }
      graph.push(totalMs, null);
      status.textContent = TEXT.guide;
      busy = false;
    }

    // 「3・2・1」。1拍ずつ待つ。途中で止められたら false
    async function countIn(myRun) {
      for (const n of [3, 2, 1]) {
        status.textContent = String(n);
        await d.wait(CONFIG.stage5.noteMs);
        if (myRun !== runId || disposed || ended || session.mic !== mic) return false;
      }
      return true;
    }

    // 歌う：最初の読みの時刻を 0 として、全体の長さ＋余白のあいだ読みを集める
    function collect(myRun) {
      return new Promise((resolve) => {
        const readings = [];
        let singStart = null;
        const finish = (ok) => {
          mic.onFrame(() => {}); // 終わったら何もしない関数に戻す
          cancelSing = null;
          resolve(ok ? readings : null);
        };
        cancelSing = () => finish(false);
        mic.onFrame((midi, now) => {
          if (myRun !== runId) return finish(false);
          if (singStart === null) {
            singStart = now;
            placeBands(graph, segments, tolerance, singStart); // 帯がグラフの時計といっしょに流れる
          }
          readings.push({ t: now - singStart, midi });
          graph.push(now, midi);
          if (now - singStart >= totalMs + TAIL_MS) finish(true);
        });
      });
    }

    async function sing() {
      if (busy) return;
      busy = true;
      stopEverything();
      const myRun = runId;
      graph.clear();
      resultBox.replaceChildren();
      if (!(await countIn(myRun))) return;
      status.textContent = TEXT.go;
      const readings = await collect(myRun);
      if (!readings || myRun !== runId || disposed || ended) return;
      busy = false;
      showResult(readings);
    }

    function showResult(readings) {
      const score = scoreMelody(readings, segments, tolerance, true);
      const passed = score >= CONFIG.stage5.passRatio;
      tries += 1;
      if (passed) successes += 1;
      scores.push(score);
      ladder.answer(passed);
      graph.setOk(passed);
      status.textContent = passed ? TEXT.ok : TEXT.close;
      const list = document.createElement('ul');
      for (const v of noteVerdicts(readings, segments, tolerance)) {
        const li = document.createElement('li');
        li.textContent = `${noteLabel(v.midi)}：${VERDICT_TEXT[v.verdict]}`;
        list.append(li);
      }
      resultBox.replaceChildren(
        note(`いまの 合いぐあい：${Math.round(score * 100)}%（目安）`),
        list,
        button('もう一度', showMelody),
        button('つぎの メロディ', () => {
          melody = pickMelody(ladder.level, d.rand);
          showMelody();
        }),
      );
    }

    root.replaceChildren(
      title(),
      note(`レベル ${ladder.level}`),
      note(melody.name),
      status,
      canvas,
      resultBox,
      button('▶ お手本', playModel),
      button('歌う', sing),
      button('おわる', finishSession),
      ...tipNote(),
    );
    showStaircase();
  }

  showIntro();
  return () => {
    disposed = true;
    stopEverything();
    session.close();
    if (tries > 0) save();
  };
}
