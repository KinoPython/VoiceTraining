// 練習の目標の高さを決める。いつも「声の地図」の範囲の中におさめる。
import { CONFIG } from './config.js';
import { clampToRange } from './range.js';

// レベルが上がるほど帯をせまく（きびしく）する
export function toleranceFor(level) {
  return CONFIG.tolerance.find((t) => level <= t.upTo).cents;
}

// 声をすべらせる練習。below = 楽な高さから上の目標へ、above = 下の目標へ
export function glideTarget(level, tryIndex, range) {
  const distance = 2 + Math.floor(level / 2);
  const startFrom = level >= 2 && tryIndex % 2 === 1 ? 'above' : 'below';
  const raw = range.comfort + (startFrom === 'below' ? distance : -distance);
  return { targetMidi: clampToRange(raw, range), startFrom };
}

// 音を合わせる練習。楽な高さの近くから、くじで1つ選ぶ
export function matchTarget(level, tryIndex, range, rand = Math.random) {
  const reach = 1 + level;
  const offset = Math.floor(rand() * (2 * reach + 1)) - reach;
  return clampToRange(range.comfort + offset, range);
}
