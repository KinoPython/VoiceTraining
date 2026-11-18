// 段1 聞き分け：2つの音を聞いて、2つ目が高いか低いかを答える
import { go } from '../router.js';
import { button, heading, note } from '../ui/components.js';
import { renderKeyboard } from '../ui/keyboard.js';
import { playSequence, stopAll } from '../audio/tone.js';
import { createLadder } from '../logic/ladder.js';
import { gapForLevel, makeListenTrial, listenResult } from '../logic/listenTrial.js';
import { gapLabel } from '../logic/notes.js';
import { CONFIG } from '../logic/config.js';
import { loadState, setLevel, addHistory } from '../storage/store.js';

const defaultDeps = { playSequence, stopAll, rand: Math.random };

const SLOW_TONE_MS = 1200; // 「ゆっくり 聞く」の1音の長さ
const SLOW_PAUSE_MS = 600; // 「ゆっくり 聞く」の音と音の間
const WORD = { high: '高い', low: '低い' };
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const isWhite = (midi) => WHITE_PCS.includes(((midi % 12) + 12) % 12);

// 履歴に入れる日付。端末の「今日」（UTC ではなく）で YYYY-MM-DD にする
function localDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 2音の前後2半音を含む鍵盤を、端が白鍵になるよう外側へ広げて描く
function keyboardFor(first, second) {
  let fromMidi = Math.min(first, second) - 2;
  let toMidi = Math.max(first, second) + 2;
  while (!isWhite(fromMidi)) fromMidi -= 1;
  while (!isWhite(toMidi)) toMidi += 1;
  return renderKeyboard({
    fromMidi,
    toMidi,
    marks: [{ midi: first, kind: 'a' }, { midi: second, kind: 'b' }],
  });
}

export function renderStage1(root, params, deps = defaultDeps) {
  const { trials, toneMs, pauseMs } = CONFIG.stage1;
  const state = loadState();
  const center = (state.range ?? CONFIG.defaultRange).comfort;
  const ladder = createLadder({ level: state.levels.s1 });
  const gaps = []; // 答えた問の差（半音）
  let successes = 0;
  let trial = null;
  let playToken = 0; // 音を鳴らすたびに増やし、古い再生の終わりを無視する
  let disposed = false;

  const answered = () => gaps.length;

  function nextTrial() {
    trial = makeListenTrial(center, gapForLevel(ladder.level), deps.rand);
  }

  // 音を鳴らし、終わったら onDone を呼ぶ（途中で止められたら呼ばない）
  async function play(notes, pause, onDone) {
    deps.stopAll();
    const token = ++playToken;
    await deps.playSequence(notes, pause);
    if (!disposed && token === playToken) onDone?.();
  }

  const trialNotes = (ms) => [
    { midi: trial.first, durationMs: ms },
    { midi: trial.second, durationMs: ms },
  ];

  function showQuestion() {
    const high = button('高い ↑', () => answer('high'));
    const low = button('低い ↓', () => answer('low'));
    const setAnswerable = (on) => { high.disabled = !on; low.disabled = !on; };
    setAnswerable(false); // 聞く前と、鳴っているあいだは押せない
    const listen = () => {
      setAnswerable(false);
      play(trialNotes(toneMs), pauseMs, () => { setAnswerable(true); listenButton.textContent = 'もう一度 聞く'; });
    };
    const listenButton = button('▶ 聞く', listen);
    root.replaceChildren(
      heading('聞き分け'),
      note(`${answered() + 1} / ${trials}`),
      note('2つの 音を 鳴らします。2つ目は 高い？ 低い？'),
      listenButton,
      high,
      low,
      button('おわる', finish),
    );
  }

  function answer(choice) {
    const ok = choice === trial.answer;
    gaps.push(Math.abs(trial.second - trial.first));
    if (ok) successes += 1;
    ladder.answer(ok);
    showFeedback(ok);
  }

  function showFeedback(ok) {
    const message = ok ? '当たり！' : `答えは『${WORD[trial.answer]}』でした。もう一度 聞いて みましょう`;
    const last = answered() >= trials;
    root.replaceChildren(
      heading('聞き分け'),
      note(message),
      keyboardFor(trial.first, trial.second),
      button('ゆっくり 聞く', () => play(trialNotes(SLOW_TONE_MS), SLOW_PAUSE_MS)),
      button('つぎへ', () => (last ? finish() : (nextTrial(), showQuestion()))),
      button('おわる', finish),
    );
  }

  // 答えた問があれば、レベルと記録を保存して結果を出す。なければホームへ
  function finish() {
    deps.stopAll();
    if (answered() === 0) return go('home');
    const value = listenResult(gaps);
    setLevel('s1', ladder.level);
    addHistory({ date: localDate(), stage: 1, tries: answered(), successes, value });
    showResult(value);
  }

  function showResult(value) {
    root.replaceChildren(
      heading('聞き分け'),
      note(`いま 聞き分けられる 差の 目安：${gapLabel(value)}`),
      keyboardFor(60, 60 + value),
      button('もう一度', () => go('stage1')),
      button('ホームへ', () => go('home')),
    );
  }

  nextTrial();
  showQuestion();
  return () => {
    disposed = true;
    deps.stopAll();
  };
}
