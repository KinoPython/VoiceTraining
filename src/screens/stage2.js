// 段2 声の地図：楽な高さと、出せる範囲を測る
import { go } from '../router.js';
import { button, heading, note } from '../ui/components.js';
import { renderKeyboard } from '../ui/keyboard.js';
import { createPitchGraph } from '../ui/pitchGraph.js';
import { createMicSession } from '../ui/practiceLoop.js';
import { openMic } from '../audio/mic.js';
import { comfortFrom, edgeFrom, makeRange } from '../logic/range.js';
import { noteLabel } from '../logic/notes.js';
import { CONFIG } from '../logic/config.js';
import { todayString } from '../logic/today.js';
import { saveRange, addHistory } from '../storage/store.js';

const defaultDeps = { openMic };

const GRAPH = { minMidi: 36, maxMidi: 84 };
const DEFAULT_FRAME_MS = 16; // コマの間隔が測れないときの仮の値
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const isWhite = (midi) => WHITE_PCS.includes(((midi % 12) + 12) % 12);

const TEXT = {
  intro: '声の 高さを 測るため、マイクを 使います',
  comfort: 'いちばん 楽な 声で『んー』を 3秒',
  down: '楽な 高さから、ゆっくり 下げて いきます。苦しく ない 所まで',
  up: '楽な 高さから、ゆっくり 上げて いきます。苦しく なる 手前で 止めて ください。無理に 高い 所を 出さなくて 大丈夫です。',
  short: 'もう少し 長く 声を 出して みましょう',
  stopped: 'マイクが 止まりました。',
  widened: '今回は 幅を 少し 広めに しました。あとで 測りなおせます',
};

// 測る手順。ms は録る長さ、text は画面の説明
const STEPS = [
  { key: 'comfort', text: TEXT.comfort, ms: CONFIG.stage2.comfortMs },
  { key: 'low', text: TEXT.down, ms: CONFIG.stage2.glideMs },
  { key: 'high', text: TEXT.up, ms: CONFIG.stage2.glideMs },
];

// 1コマあたりの平均の長さ（ミリ秒）。測れなければ仮の値
function averageFrameMs(times) {
  if (times.length < 2) return DEFAULT_FRAME_MS;
  return (times[times.length - 1] - times[0]) / (times.length - 1);
}

// 端が白鍵になるよう外側へ広げた鍵盤
function resultKeyboard(range) {
  let fromMidi = range.low - 2;
  let toMidi = range.high + 2;
  while (!isWhite(fromMidi)) fromMidi -= 1;
  while (!isWhite(toMidi)) toMidi += 1;
  return renderKeyboard({
    fromMidi,
    toMidi,
    marks: [
      { midi: range.low, kind: 'b' },
      { midi: range.high, kind: 'b' },
      { midi: range.comfort, kind: 'a' },
    ],
  });
}

export function renderStage2(root, params, deps = defaultDeps) {
  let stepIndex = 0;
  let comfort = null;
  let low = null;
  let recordToken = 0; // 録るたびに増やし、古い録音の続きを無視する

  const title = () => heading('声の地図');

  // マイクの開け閉めは段3〜5と同じ仕組みに任せる（連打で2つ開かないように）
  const session = createMicSession({
    openMic: (...args) => deps.openMic(...args),
    root,
    onReady: () => showStep(), // いまの手順を最初から
    onHidden: () => {
      recordToken += 1; // 録っている途中なら止める
      showStopped();
    },
  });

  function showIntro() {
    root.replaceChildren(title(), note(TEXT.intro), button('マイクを ひらく', () => session.open()));
  }

  function showStopped() {
    root.replaceChildren(title(), note(TEXT.stopped), button('もう一度 マイクを ひらく', () => session.open()));
  }

  function showStep() {
    const step = STEPS[stepIndex];
    session.mic.onFrame(() => {}); // 録る前の声は使わない
    root.replaceChildren(
      title(),
      note(`${stepIndex + 1} / ${STEPS.length}`),
      note(step.text),
      button('はじめる', () => record(step)),
    );
  }

  // step.ms の間、声の高さを集める（長さは各コマの時刻で測る）
  function record(step) {
    const token = ++recordToken;
    const mic = session.mic;
    const readings = [];
    const times = [];
    let startMs = null;
    const canvas = document.createElement('canvas');
    const graph = createPitchGraph(canvas, GRAPH);
    const countdown = note('');
    root.replaceChildren(
      title(),
      note(step.text),
      canvas,
      countdown,
      button('やり直す', () => { recordToken += 1; showStep(); }),
    );
    mic.onFrame((midi, now) => {
      if (token !== recordToken) return;
      if (startMs === null) startMs = now;
      readings.push(midi);
      times.push(now);
      graph.push(now, midi);
      const left = Math.max(0, step.ms - (now - startMs));
      countdown.textContent = `のこり ${Math.ceil(left / 1000)} 秒`;
      if (left === 0) {
        recordToken += 1;
        finishStep(step, readings, times);
      }
    });
  }

  function finishStep(step, readings, times) {
    if (step.key === 'comfort') {
      comfort = comfortFrom(readings, averageFrameMs(times));
      if (comfort === null) return showTooShort();
    } else if (step.key === 'low') {
      low = edgeFrom(readings, 'low');
    } else {
      return showResult(edgeFrom(readings, 'high'));
    }
    stepIndex += 1;
    showStep();
  }

  function showTooShort() {
    root.replaceChildren(title(), note(TEXT.short), button('やり直す', showStep));
  }

  function showResult(high) {
    const range = makeRange(comfort, low, high);
    saveRange({ comfort: range.comfort, low: range.low, high: range.high });
    addHistory({ date: todayString(), stage: 2, tries: 1, successes: 1, value: range.high - range.low });
    session.release(); // 測り終えたらマイクを止める（「やり直す」で開き直せる）
    root.replaceChildren(
      title(),
      note(`楽な 高さ：${noteLabel(range.comfort)}`),
      note(`出せる 幅：${noteLabel(range.low)}〜${noteLabel(range.high)}`),
      ...(range.widened ? [note(TEXT.widened)] : []),
      resultKeyboard(range),
      button('やり直す', () => { stepIndex = 0; session.open(); }),
      button('段3へ', () => go('stage3')),
      button('ホームへ', () => go('home')),
    );
  }

  showIntro();
  return () => {
    recordToken += 1;
    session.close();
  };
}
