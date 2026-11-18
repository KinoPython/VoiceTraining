// 声の地図：測った高さの記録から「楽な高さ」と「出せる範囲」を決める。
import { CONFIG } from './config.js';

const voiced = (readings) => readings.filter((m) => m !== null && m !== undefined);

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// 声が出ていた時間が足りなければ null。足りれば中央値（外れ値に強い）を整数に
export function comfortFrom(readings, frameMs) {
  const v = voiced(readings);
  if (v.length * frameMs < CONFIG.stage2.comfortNeedMs) return null;
  return Math.round(median(v));
}

// 端っこは最小・最大ではなくパーセンタイルで取る（声の裏返りの1発に引っぱられないため）
export function edgeFrom(readings, side) {
  const v = voiced(readings).sort((a, b) => a - b);
  if (v.length < 10) return null;
  const pct = side === 'low' ? CONFIG.stage2.lowPct : CONFIG.stage2.highPct;
  return Math.round(v[Math.round((pct / 100) * (v.length - 1))]);
}

// 端が取れない・おかしいときは comfort の±3で補う。幅がせますぎるときも広げる
export function makeRange(comfort, low, high) {
  let lo = low === null || low > comfort ? comfort - 3 : low;
  let hi = high === null || high < comfort ? comfort + 3 : high;
  let widened = false;
  if (hi - lo < CONFIG.stage2.minWidth) {
    lo = comfort - 3;
    hi = comfort + 3;
    widened = true;
  }
  return { comfort, low: lo, high: hi, widened };
}

// 目標が出せる範囲の外に出ないようにする
export function clampToRange(midi, range) {
  return Math.min(range.high, Math.max(range.low, midi));
}
