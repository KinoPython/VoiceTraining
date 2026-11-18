import { CONFIG } from './config.js';

const LOW_LIMIT = 40; // 出す音の下限（MIDI）
const HIGH_LIMIT = 76; // 出す音の上限（MIDI）

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 段1：レベルが上がるほど2つの音の差（半音）を小さくする
export function gapForLevel(level) {
  const { startGap, minGap, maxGap } = CONFIG.stage1;
  return clamp(startGap - level, minGap, maxGap);
}

// 段1の1問：1つ目の音と、gap 半音だけ高い／低い2つ目の音を作る
export function makeListenTrial(centerMidi, gap, rand = Math.random) {
  // 毎回同じ高さだと覚えてしまうので、中心の前後2半音でゆらす
  const first = clamp(Math.round(centerMidi) + Math.floor(rand() * 5) - 2, LOW_LIMIT, HIGH_LIMIT);
  const canGoHigh = first + gap <= HIGH_LIMIT;
  const canGoLow = first - gap >= LOW_LIMIT;
  // 両方入るときだけ乱数で選ぶ。片方しか入らなければそちら
  const goHigh = canGoHigh && canGoLow ? rand() < 0.5 : canGoHigh;
  return goHigh
    ? { first, second: first + gap, answer: 'high' }
    : { first, second: first - gap, answer: 'low' };
}

// 段1の結果：最後の数問の差の平均（聞き分けられた差の目安）
export function listenResult(gaps) {
  const last = gaps.slice(-CONFIG.stage1.lastForResult);
  return Math.round(last.reduce((a, b) => a + b, 0) / last.length);
}
