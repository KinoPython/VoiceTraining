import { describe, it, expect } from 'vitest';
import { MELODIES, pickMelody, melodySegments, scoreMelody, noteVerdicts } from '../../src/logic/melodies.js';

const byId = (id) => MELODIES.find((m) => m.id === id);

describe('MELODIES', () => {
  it('表の10個がそろい、id はぜんぶちがう', () => {
    expect(MELODIES).toHaveLength(10);
    expect(new Set(MELODIES.map((m) => m.id)).size).toBe(10);
    expect(byId('do-re-mi-re-do')).toMatchObject({ steps: [0, 2, 4, 2, 0], level: 2, name: 'ド→レ→ミ→レ→ド' });
    expect(byId('do-so-mi-do')).toMatchObject({ steps: [0, 7, 4, 0], level: 5, name: 'ド→ソ→ミ→ド' });
  });
});

describe('pickMelody', () => {
  it('level の半分以下のものだけから選ぶ', () => {
    for (let i = 0; i < 50; i++) expect(pickMelody(2).level).toBeLessThanOrEqual(1);
    expect(pickMelody(0, () => 0.9).level).toBe(0);
  });
  it('いちばん新しい level を半分の確率で選ぶ', () => {
    // 1回目のくじ < 0.5 → 新しい level（floor(3/2)=1）から選ぶ
    for (let i = 0; i < 20; i++) expect(pickMelody(3, () => 0.1).level).toBe(1);
  });
  it('くじが 0.5 以上なら全部の中から選ぶ', () => {
    expect(pickMelody(3, () => 0.99).id).toBe('mi-re-do');
  });
});

describe('melodySegments', () => {
  it('comfort−2 から始める', () => {
    const s = melodySegments(byId('do-mi-so'), { comfort: 57, low: 50, high: 62 });
    expect(s.map((x) => x.midi)).toEqual([55, 59, 62]);
    expect(s.map((x) => x.startMs)).toEqual([0, 800, 1600]);
    expect(s[2].endMs).toBe(2400);
  });
  it('高すぎるなら下げる', () => {
    const s = melodySegments(byId('do-mi-so'), { comfort: 57, low: 40, high: 60 });
    expect(s.map((x) => x.midi)).toEqual([53, 57, 60]);
  });
  it('低すぎるなら上げる', () => {
    const s = melodySegments(byId('so-mi-do'), { comfort: 52, low: 50, high: 70 });
    expect(Math.min(...s.map((x) => x.midi))).toBe(50);
  });
  it('両方むりなら low に合わせる', () => {
    const s = melodySegments(byId('do-mi-so'), { comfort: 57, low: 54, high: 58 });
    expect(Math.min(...s.map((x) => x.midi))).toBe(54);
  });
});

describe('scoreMelody', () => {
  const segs = [
    { midi: 60, startMs: 0, endMs: 800 },
    { midi: 64, startMs: 800, endMs: 1600 },
  ];
  const sing = (fn) => {
    const r = [];
    for (let t = 0; t < 1600; t += 20) r.push({ t, midi: fn(t, t < 800 ? 60 : 64) });
    return r;
  };
  it('ぴったりなら 1', () => {
    expect(scoreMelody(sing((t, m) => m), segs, 100)).toBe(1);
  });
  it('全部 1.5半音ずれなら 0', () => {
    expect(scoreMelody(sing((t, m) => m + 1.5), segs, 100)).toBe(0);
  });
  it('半分の音だけ合うなら 0.5 前後', () => {
    expect(scoreMelody(sing((t, m) => (t < 800 ? m : m + 3)), segs, 100)).toBeCloseTo(0.5, 1);
  });
  it('各音の最初の 250ms がずれても 1', () => {
    const r = sing((t, m) => ((t % 800) < 250 ? m + 3 : m));
    expect(scoreMelody(r, segs, 100)).toBe(1);
  });
  it('1オクターブ上でぴったりなら 1（allowOctave）', () => {
    expect(scoreMelody(sing((t, m) => m + 12), segs, 100)).toBe(1);
    expect(scoreMelody(sing((t, m) => m + 12), segs, 100, false)).toBe(0);
  });
  it('声が出ていない読み(null)は帯の外あつかい。読みがなければ 0', () => {
    expect(scoreMelody(sing((t, m) => (t < 800 ? m : null)), segs, 100)).toBeCloseTo(0.5, 1);
    expect(scoreMelody([], segs, 100)).toBe(0);
    expect(scoreMelody([{ t: 100, midi: 60 }], segs, 100)).toBe(0); // skip 窓の中だけ
  });
});

describe('noteVerdicts', () => {
  const segs = [
    { midi: 60, startMs: 0, endMs: 800 },
    { midi: 64, startMs: 800, endMs: 1600 },
    { midi: 62, startMs: 1600, endMs: 2400 },
  ];
  // 音ごとの高さを関数で与えて、20ms ごとの読みを作る（null は声なし）
  const sing = (fn) => {
    const r = [];
    for (let t = 0; t < 2400; t += 20) r.push({ t, midi: fn(Math.floor(t / 800)) });
    return r;
  };
  it('合っていれば ok、高ければ high、低ければ low', () => {
    const r = sing((i) => [60, 65.5, 61][i]);
    expect(noteVerdicts(r, segs, 50).map((v) => v.verdict)).toEqual(['ok', 'high', 'low']);
  });
  it('声がなければ none', () => {
    const r = sing((i) => (i === 1 ? null : [60, 0, 62][i]));
    expect(noteVerdicts(r, segs, 50).map((v) => v.verdict)).toEqual(['ok', 'none', 'ok']);
  });
  it('1オクターブちがいは合っている扱い', () => {
    const r = sing((i) => [72, 64, 62][i]);
    expect(noteVerdicts(r, segs, 50)[0].verdict).toBe('ok');
  });
  it('出始めの skipMs 以内の外れは数えない（中央値で見る）', () => {
    const r = sing(() => 60).map((x) => (x.t < 250 ? { ...x, midi: 50 } : x));
    expect(noteVerdicts(r, [segs[0]], 50)[0].verdict).toBe('ok');
  });
  it('midi を一緒に返す', () => {
    expect(noteVerdicts([], segs, 50).map((v) => v.midi)).toEqual([60, 64, 62]);
  });
});
