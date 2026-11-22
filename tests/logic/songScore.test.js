import { describe, it, expect } from 'vitest';
import { notesInSection, scoreSection, lineToGhost } from '../../src/logic/songScore.js';
import { CONFIG } from '../../src/logic/config.js';

const LAT = CONFIG.stage6.latencyMs;
// 2つの音（各1秒）。60 → 62
const notes = [
  { midi: 60, startMs: 0, endMs: 1000 },
  { midi: 62, startMs: 1000, endMs: 2000 },
];
// 歌った高さ fn(曲の時刻ms) を、マイクの遅れ分おくらせた readings にする
const sing = (fn) => {
  const out = [];
  for (let s = 0; s < 2000; s += 20) out.push({ t: s + LAT, midi: fn(s) });
  return out;
};

describe('scoreSection', () => {
  it('お手本どおり（遅れて）歌うと ratio 1、すべて ok', () => {
    const r = scoreSection(sing((s) => (s < 1000 ? 60 : 62)), notes, 50);
    expect(r.ratio).toBeCloseTo(1, 1);
    expect(r.verdicts).toEqual(['ok', 'ok']);
  });
  it('2つ目だけ1.5半音上なら verdicts[1] が high', () => {
    const r = scoreSection(sing((s) => (s < 1000 ? 60 : 63.5)), notes, 50);
    expect(r.verdicts).toEqual(['ok', 'high']);
    expect(r.ratio).toBeLessThan(0.6);
  });
  it('1オクターブ下でぴったりでも ok', () => {
    const r = scoreSection(sing((s) => (s < 1000 ? 48 : 50)), notes, 50);
    expect(r.verdicts).toEqual(['ok', 'ok']);
    expect(r.ratio).toBeCloseTo(1, 1);
  });
  it('声が無い（null だけ）なら none、ratio は 0', () => {
    const r = scoreSection(sing(() => null), notes, 50);
    expect(r.verdicts).toEqual(['none', 'none']);
    expect(r.ratio).toBe(0);
  });
  it('音の外の読みは数えない', () => {
    const extra = [{ t: 5000, midi: 80 }];
    const r = scoreSection([...sing((s) => (s < 1000 ? 60 : 62)), ...extra], notes, 50);
    expect(r.ratio).toBeCloseTo(1, 1);
  });
  it('短い音（200ms）も数える：飛ばすのは音の長さの3割まで', () => {
    const short = [{ midi: 60, startMs: 0, endMs: 200 }, { midi: 62, startMs: 200, endMs: 400 }];
    const readings = [];
    for (let s = 0; s < 400; s += 20) readings.push({ t: s + LAT, midi: s < 200 ? 60 : 62 });
    const r = scoreSection(readings, short, 50);
    expect(r.ratio).toBeCloseTo(1, 5);
    expect(r.verdicts).toEqual(['ok', 'ok']);
  });
  it('長い音では、出だしの 250ms はこれまでどおり数えない', () => {
    // 出だし 240ms だけ外れて、あとは合っている → 100%
    const readings = [];
    for (let s = 0; s < 1000; s += 20) readings.push({ t: s + LAT, midi: s < 240 ? 66 : 60 });
    expect(scoreSection(readings, [notes[0]], 50).ratio).toBeCloseTo(1, 5);
  });
  it('音はあるのに判定できる読みが1つも無いときは 0% ではなく null', () => {
    expect(scoreSection([], notes, 50).ratio).toBeNull();
  });
  it('notes が空なら ratio は null', () => {
    expect(scoreSection(sing(() => 60), [], 50)).toEqual({ ratio: null, verdicts: [] });
  });
});

describe('notesInSection', () => {
  it('区間 1.0〜2.0秒に重なる音は、区間の始まりからの ms にして入る', () => {
    const r = notesInSection([{ midi: 60, startMs: 500, endMs: 1500 }], 1, 2);
    expect(r).toEqual([{ midi: 60, startMs: 0, endMs: 500 }]);
  });
  it('重ならない音は入らない。区間より長い音は区間でそろえる', () => {
    const list = [
      { midi: 60, startMs: 0, endMs: 900 },
      { midi: 62, startMs: 900, endMs: 3000 },
      { midi: 64, startMs: 2000, endMs: 2500 },
    ];
    expect(notesInSection(list, 1, 2)).toEqual([{ midi: 62, startMs: 0, endMs: 1000 }]);
  });
});

describe('lineToGhost（保存する前回の線）', () => {
  it('t は整数の ms、midi は小数2けたに丸める（保存の量をへらすため）', () => {
    const readings = [{ t: 0.4, midi: 60.123456 }, { t: 20.6, midi: null }, { t: 45.2, midi: 61.006 }];
    expect(lineToGhost(readings)).toEqual([
      { t: 0, midi: 60.12 }, { t: 21, midi: null }, { t: 45, midi: 61.01 },
    ]);
  });
  it(`点の数は ${CONFIG.stage6.ghostMaxPoints} まで（長い区間でも保存がいっぱいにならないように）`, () => {
    const readings = Array.from({ length: 5000 }, (_, k) => ({ t: k * 20, midi: 60 }));
    const out = lineToGhost(readings);
    expect(out).toHaveLength(CONFIG.stage6.ghostMaxPoints);
    expect(out[0].t).toBe(0);
  });
});

describe('lineToGhost', () => {
  it('20ms ごとに間引いて {t, midi} だけ残す', () => {
    const readings = [0, 5, 10, 20, 25, 40].map((t) => ({ t, midi: 60, extra: 1 }));
    expect(lineToGhost(readings)).toEqual([
      { t: 0, midi: 60 },
      { t: 20, midi: 60 },
      { t: 40, midi: 60 },
    ]);
  });
});
