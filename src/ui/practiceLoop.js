// 段3・4・5で使い回す「1回ためす」の仕組みと、マイクの開け閉め。
import { renderMicGuide } from './micGuide.js';

const noop = () => {};

// tryMs の間、マイクの高さを graph と judge に流す。
// judge が done を返したら早めに、tryMs たったら done:false で終わる。cancel() でも done:false で終わる。
// 時間は「コマの時刻」で数える（画面のタイマーとずれないように）。
export function runTry({ mic, graph, judge, tryMs, onUpdate = noop }) {
  let settle;
  let finished = false;
  let startMs = null;
  let lastDirection = null;
  let octaveShift = 0;
  const promise = new Promise((resolve) => { settle = resolve; });

  function finish(done) {
    if (finished) return;
    finished = true;
    mic.onFrame(noop); // Mic.onFrame は1つだけ。終わったら何もしない関数に戻す
    settle({ done, octaveShift, lastDirection });
  }

  mic.onFrame((midi, now) => {
    if (finished) return;
    if (startMs === null) startMs = now;
    graph.push(now, midi);
    const result = judge.update(midi, now);
    lastDirection = result.direction;
    octaveShift = result.octaveShift;
    onUpdate(result);
    if (result.state === 'done') finish(true);
    else if (now - startMs >= tryMs) finish(false);
  });

  return { promise, cancel: () => finish(false) };
}

// マイクの開け閉め（段3〜5共通）。
// ・開いている最中にもう一度 open() しても無視する（連打対策）
// ・close() のあとに遅れて開いたマイクは、すぐ閉じる
// ・画面を隠して自動で閉じたときだけ onHidden を呼ぶ
export function createMicSession({ openMic, root, onReady, onHidden }) {
  let mic = null;
  let pending = false;
  let closed = false;

  async function open() {
    if (pending || closed || mic) return;
    pending = true;
    let result;
    try {
      result = await openMic();
    } finally {
      pending = false;
    }
    if (closed) {
      if (result.ok) result.mic.close();
      return;
    }
    if (!result.ok) {
      renderMicGuide(root, result.reason);
      return;
    }
    const opened = result.mic;
    mic = opened;
    opened.onClosed((reason) => {
      if (closed || opened !== mic || reason !== 'hidden') return;
      mic = null;
      onHidden();
    });
    onReady(opened);
  }

  function close() {
    closed = true;
    if (mic) mic.close();
    mic = null;
  }

  return {
    open,
    close,
    get mic() {
      return mic;
    },
  };
}
