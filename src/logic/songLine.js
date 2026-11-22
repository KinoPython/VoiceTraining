// 曲（の波）から「お手本の線」を作る。スマホの中だけで処理し、外へは出さない。
import { CONFIG } from './config.js';
import { detectPitch, createSmoother } from './pitch.js';

const WINDOW = 2048; // 高さを測る1回ぶんの長さ（点の数）

// 左右の音を平均して1本にする（高さを測るには1本で足りる）
export function mixToMono(audioBuffer) {
  const n = audioBuffer.numberOfChannels;
  const out = new Float32Array(audioBuffer.length);
  for (let c = 0; c < n; c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += data[i] / n;
  }
  return out;
}

// hopMs ごとに高さを測って並べる。
// 長い曲でも画面が固まらないよう、yieldEvery 個ごとに順番を返し、進み具合を知らせる
export async function extractLine(samples, sampleRate, { onProgress, signal, yieldEvery = 200 } = {}) {
  const { hopMs } = CONFIG.stage6;
  const hop = Math.round((sampleRate * hopMs) / 1000);
  const total = samples.length < WINDOW ? 0 : Math.floor((samples.length - WINDOW) / hop) + 1;
  const smoother = createSmoother();
  const midi = [];
  for (let i = 0; i < total; i++) {
    if (i > 0 && i % yieldEvery === 0) {
      await new Promise((r) => setTimeout(r, 0));
      // 画面を離れたら、作るのをやめる
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      onProgress?.(i / total);
    }
    const start = i * hop;
    midi.push(smoother.push(detectPitch(samples.subarray(start, start + WINDOW), sampleRate)));
  }
  onProgress?.(1);
  return { hopMs, midi };
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// 線を「音」の並びにする。最初の値から tolCents 以内が続く間を1つの音とし、null で切る
export function toNotes(line, { minMs = CONFIG.stage6.noteMinMs, tolCents = CONFIG.stage6.noteTolCents } = {}) {
  const notes = [];
  const { hopMs, midi } = line;
  let from = null; // いまの音の最初の位置
  const close = (to) => {
    if (from === null) return;
    if ((to - from) * hopMs >= minMs) {
      notes.push({ midi: median(midi.slice(from, to)), startMs: from * hopMs, endMs: to * hopMs });
    }
    from = null;
  };
  midi.forEach((v, k) => {
    if (v === null) return close(k);
    if (from !== null && Math.abs(v - midi[from]) * 100 > tolCents) close(k);
    if (from === null) from = k;
  });
  close(midi.length);
  return notes;
}

// お手本の高い方（95パーセンタイル）が声の上限を超える分を、半音（切り上げ）で返す。
// 「キーを下げる目安」として使う。range が無ければ 0
export function keyAdvice(notes, range) {
  if (!range || notes.length === 0) return 0;
  const sorted = notes.map((n) => n.midi).sort((a, b) => a - b);
  const high = sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))];
  const over = Math.ceil(high - range.high - 1e-9);
  return Math.max(0, Math.min(CONFIG.stage6.keyAdviceMax, over));
}
