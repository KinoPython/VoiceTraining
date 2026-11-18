// 声の高さを測る。マイクの波（samples）から、いまの高さを MIDI 番号の小数で返す。
import { PitchDetector } from 'pitchy';
import { CONFIG } from './config.js';
import { hzToMidi } from './notes.js';

// 検出器は作るたびに作業用の場所を確保して重いので、波の長さごとに使い回す
const detectors = new Map();
function detectorFor(length) {
  if (!detectors.has(length)) detectors.set(length, PitchDetector.forFloat32Array(length));
  return detectors.get(length);
}

// 音の大きさ（二乗平均の平方根）。小さすぎる音は、息や部屋の音とみなして測らない
function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

// 高さが無い・自信が無いときは null（間違った高さを出すより、何も出さないほうが安全）
export function detectPitch(samples, sampleRate) {
  const { minHz, maxHz, minClarity, minRms } = CONFIG.pitch;
  if (rms(samples) < minRms) return null;
  const [hz, clarity] = detectorFor(samples.length).findPitch(samples, sampleRate);
  if (clarity < minClarity || !(hz >= minHz && hz <= maxHz)) return null;
  return hzToMidi(hz);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 直近 frames 個の中央値でならす。一瞬のオクターブ跳びなどの飛び値を無視するため
export function createSmoother(frames = CONFIG.pitch.smoothFrames) {
  let recent = [];
  return {
    push(midi) {
      recent.push(midi);
      if (recent.length > frames) recent.shift();
      const values = recent.filter((v) => v !== null);
      // 半分より多くが null なら、声が途切れているとみなして null
      if (values.length === 0 || recent.length - values.length > recent.length / 2) return null;
      return median(values);
    },
    reset() {
      recent = [];
    },
  };
}
