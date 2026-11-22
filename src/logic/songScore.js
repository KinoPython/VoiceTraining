// 段6：曲の区間の判定。お手本の線との合いぐあいは「目安」。
import { CONFIG } from './config.js';
import { centsOff, foldOctave } from './notes.js';
import { noteVerdicts } from './melodies.js';

// 区間（秒）に重なる音だけを取り出し、区間の始まりからの ms に直す。
// 区間の外にはみ出す部分は切りおとす（画面は区間の中だけを描くため）
export function notesInSection(notes, startSec, endSec) {
  const from = startSec * 1000;
  const to = endSec * 1000;
  return notes
    .filter((n) => n.endMs > from && n.startMs < to)
    .map((n) => ({
      midi: n.midi,
      startMs: Math.max(n.startMs, from) - from,
      endMs: Math.min(n.endMs, to) - from,
    }));
}

// 声が出始めるまでの時間は数えない（段5と同じ考え）。ただし曲の音は短いことがあるので、
// 飛ばすのは段5の skipMs か、音の長さの skipRatio（3割）の短い方。そうしないと短い音は一度も数えられない
export const skipMsFor = (n) => Math.min(CONFIG.stage5.skipMs, (n.endMs - n.startMs) * CONFIG.stage6.skipRatio);
const isScored = (n, t) => t >= n.startMs + skipMsFor(n) && t < n.endMs;

// readings の t は区間の始まりからの ms。マイクの遅れ(latencyMs)を引いてから判定する。
// お手本の音が無い区間・数えられる読みが1つも無いときは 0% ではなく null（測れなかったと出すため）
export function scoreSection(readings, notes, toleranceCents, latencyMs = CONFIG.stage6.latencyMs) {
  if (notes.length === 0) return { ratio: null, verdicts: [] };
  const shifted = readings.map((r) => ({ t: r.t - latencyMs, midi: r.midi }));
  let counted = 0;
  let inside = 0;
  for (const r of shifted) {
    const note = notes.find((n) => isScored(n, r.t));
    if (!note) continue; // 音の外の読みは数えない
    counted += 1;
    // 声が出ていない読みは「帯の中ではない」。1オクターブちがいは合っている扱い
    if (r.midi !== null && Math.abs(foldOctave(centsOff(r.midi, note.midi)).cents) <= toleranceCents) inside += 1;
  }
  const verdicts = noteVerdicts(shifted, notes, toleranceCents, skipMsFor).map((v) => v.verdict);
  return { ratio: counted === 0 ? null : inside / counted, verdicts };
}

const round2 = (v) => (v === null ? null : Math.round(v * 100) / 100);

// 前回の線として保存する形。hopMs ごとに1つへ間引き、{t, midi} だけ残す。
// localStorage は小さいので、t は整数の ms・midi は小数2けたに丸め、点の数にも上限をつける
export function lineToGhost(readings) {
  const out = [];
  let lastT = -Infinity;
  for (const r of readings) {
    if (out.length >= CONFIG.stage6.ghostMaxPoints) break;
    const t = Math.round(r.t);
    if (t - lastT < CONFIG.stage6.hopMs) continue;
    out.push({ t, midi: round2(r.midi) });
    lastT = t;
  }
  return out;
}
