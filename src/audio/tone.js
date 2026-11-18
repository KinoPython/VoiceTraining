// お手本の音を鳴らす。マイクと同じ AudioContext を1つだけ使い回す。
import { midiToHz } from '../logic/notes.js';

const ATTACK_SEC = 0.03; // 立ち上がり：いきなり鳴らすと「プツッ」とノイズが出るため
const RELEASE_SEC = 0.08; // 消え際：同じ理由
const PEAK_GAIN = 0.3; // 耳を痛めない控えめの音量

let context = null;
const playing = new Set(); // いま鳴っている（予約済みを含む）オシレーター
let stopGeneration = 0; // stopAll のたびに増やし、playSequence の続きを打ち切る目印にする

export function getAudioContext() {
  if (!context) {
    // 古い iPhone は webkit 付きの名前しかない
    const Ctor = window.AudioContext || window.webkitAudioContext;
    context = new Ctor();
  }
  // 画面操作の前は止まっていることがあるので、毎回起こす
  if (context.state === 'suspended') context.resume();
  return context;
}

// 音量の形：0 → 立ち上がり → 保つ → 消え際 → 0
function shapeVolume(gain, startSec, endSec) {
  const attackEnd = Math.min(startSec + ATTACK_SEC, (startSec + endSec) / 2);
  const releaseStart = Math.max(attackEnd, endSec - RELEASE_SEC);
  gain.gain.setValueAtTime(0, startSec);
  gain.gain.linearRampToValueAtTime(PEAK_GAIN, attackEnd);
  gain.gain.setValueAtTime(PEAK_GAIN, releaseStart);
  gain.gain.linearRampToValueAtTime(0, endSec);
}

// 鳴り終わったときに resolve する
export function playNote(midi, durationMs, whenMs = 0) {
  const ctx = getAudioContext();
  const startSec = ctx.currentTime + whenMs / 1000;
  const endSec = startSec + durationMs / 1000;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle'; // 歌の高さを聞き取りやすい、やわらかい音
  osc.frequency.value = midiToHz(midi);
  shapeVolume(gain, startSec, endSec);
  osc.connect(gain);
  gain.connect(ctx.destination);

  return new Promise((resolve) => {
    playing.add(osc);
    osc.onended = () => {
      playing.delete(osc);
      resolve();
    };
    osc.start(startSec);
    osc.stop(endSec);
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function playSequence(notes, pauseMs = 0) {
  const generation = stopGeneration;
  for (const note of notes) {
    if (generation !== stopGeneration) return; // 途中で止められた
    await playNote(note.midi, note.durationMs);
    if (pauseMs > 0 && generation === stopGeneration) await wait(pauseMs);
  }
}

export function stopAll() {
  stopGeneration += 1;
  for (const osc of [...playing]) {
    try {
      osc.stop(); // すぐ止める。onended が呼ばれて playing から消える
    } catch {
      playing.delete(osc);
    }
  }
}
