// 段5：練習用メロディ（アプリで作ったものだけ。既存の曲のメロディは入れない）と合いぐあいの点数。
import { CONFIG } from './config.js';
import { centsOff, foldOctave } from './notes.js';

// steps は最初の音から何半音上か。name は画面に出す名前
export const MELODIES = [
  { id: 'do-re', name: 'ド→レ', steps: [0, 2], level: 0 },
  { id: 'do-re-do', name: 'ド→レ→ド', steps: [0, 2, 0], level: 0 },
  { id: 'do-re-mi', name: 'ド→レ→ミ', steps: [0, 2, 4], level: 1 },
  { id: 'mi-re-do', name: 'ミ→レ→ド', steps: [4, 2, 0], level: 1 },
  { id: 'do-mi', name: 'ド→ミ', steps: [0, 4], level: 2 },
  { id: 'do-re-mi-re-do', name: 'ド→レ→ミ→レ→ド', steps: [0, 2, 4, 2, 0], level: 2 },
  { id: 'do-mi-so', name: 'ド→ミ→ソ', steps: [0, 4, 7], level: 3 },
  { id: 'so-mi-do', name: 'ソ→ミ→ド', steps: [7, 4, 0], level: 3 },
  { id: 'do-fa-mi-re-do', name: 'ド→ファ→ミ→レ→ド', steps: [0, 5, 4, 2, 0], level: 4 },
  { id: 'do-so-mi-do', name: 'ド→ソ→ミ→ド', steps: [0, 7, 4, 0], level: 5 },
];

const pickOne = (list, rand) => list[Math.floor(rand() * list.length)];

// 難しさが上がりすぎないよう、melody.level が level の半分以下のものから選ぶ。
// 半分の確率で「いちばん新しく届いた level」のものから選び、練習し足りない新しい課題を多めにする
export function pickMelody(level, rand = Math.random) {
  const newest = Math.floor(level / 2);
  const eligible = MELODIES.filter((m) => m.level <= newest);
  const fresh = eligible.filter((m) => m.level === newest);
  const useFresh = rand() < 0.5 && fresh.length > 0;
  return pickOne(useFresh ? fresh : eligible, rand);
}

// 1音ずつの高さと時間の区切り。声の地図の範囲からはみ出さないよう、始まりの音をずらす
export function melodySegments(melody, range) {
  const highestStep = Math.max(...melody.steps);
  let base = range.comfort - 2;
  base = Math.min(base, range.high - highestStep); // 高すぎるなら下げる
  base = Math.max(base, range.low); // 低すぎるなら上げる（両方むりなら low を優先）
  return melody.steps.map((step, i) => ({
    midi: base + step,
    startMs: i * CONFIG.stage5.noteMs,
    endMs: (i + 1) * CONFIG.stage5.noteMs,
  }));
}

// 声が出始めるまでの時間(skipMs)は数えない窓にする
const scoredWindow = (seg) => ({ ...seg, from: seg.startMs + CONFIG.stage5.skipMs });

function findSegment(windows, t) {
  return windows.find((w) => t >= w.from && t < w.endMs);
}

function isInside(midi, target, toleranceCents, allowOctave) {
  if (midi === null) return false; // 声が出ていない
  const off = centsOff(midi, target);
  const cents = allowOctave ? foldOctave(off).cents : off;
  return Math.abs(cents) <= toleranceCents;
}

// 数えた読みのうち、帯の中にいた割合（0〜1）。数える読みがなければ 0
export function scoreMelody(readings, segments, toleranceCents, allowOctave = true) {
  const windows = segments.map(scoredWindow);
  let counted = 0;
  let inside = 0;
  for (const r of readings) {
    const seg = findSegment(windows, r.t);
    if (!seg) continue;
    counted += 1;
    if (isInside(r.midi, seg.midi, toleranceCents, allowOctave)) inside += 1;
  }
  return counted === 0 ? 0 : inside / counted;
}
