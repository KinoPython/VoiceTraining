import { describe, it, expect } from 'vitest';
import { extractLine, toNotes, keyAdvice, mixToMono } from '../../src/logic/songLine.js';

const SR = 44100;

// 正弦波を並べて「曲」を作る。hz が null なら無音
function makeSong(parts) {
  const chunks = parts.map(([hz, sec]) => {
    const a = new Float32Array(Math.round(SR * sec));
    if (hz) for (let i = 0; i < a.length; i++) a[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / SR);
    return a;
  });
  const all = new Float32Array(chunks.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of chunks) { all.set(c, p); p += c.length; }
  return all;
}

describe('extractLine / toNotes', () => {
  it('2つの音に分かれる（220Hz→無音→247Hz）', async () => {
    const line = await extractLine(makeSong([[220, 1], [null, 0.3], [246.94, 1]]), SR, {});
    expect(line.hopMs).toBe(20);
    const notes = toNotes(line, {});
    expect(notes).toHaveLength(2);
    expect(notes[0].midi).toBeCloseTo(57, 0);
    expect(notes[1].midi).toBeCloseTo(59, 0);
    expect(notes[0].startMs).toBeLessThan(100);
    expect(Math.abs(notes[1].startMs - 1300)).toBeLessThan(100);
  });

  it('100ms しか続かない音は音にならない', async () => {
    const line = await extractLine(makeSong([[null, 0.5], [220, 0.1], [null, 0.5]]), SR, {});
    expect(toNotes(line, {})).toHaveLength(0);
  });

  it('onProgress は増えていき、最後は 1', async () => {
    const seen = [];
    await extractLine(makeSong([[220, 2]]), SR, { onProgress: (r) => seen.push(r), yieldEvery: 20 });
    expect(seen.length).toBeGreaterThan(2);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen.every((r) => r >= 0 && r <= 1)).toBe(true);
    expect(seen.at(-1)).toBe(1);
  });

  it('signal を止めると AbortError で終わる', async () => {
    const ctrl = new AbortController();
    const p = extractLine(makeSong([[220, 3]]), SR, { signal: ctrl.signal, yieldEvery: 10, onProgress: () => ctrl.abort() });
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('keyAdvice', () => {
  const range = { low: 50, comfort: 55, high: 63 };
  const notesAt = (m) => [{ midi: m, startMs: 0, endMs: 1000 }];
  it('上の方が 66 で range.high 63 → 3', () => expect(keyAdvice(notesAt(66), range)).toBe(3));
  it('上の方が 60 → 0', () => expect(keyAdvice(notesAt(60), range)).toBe(0));
  it('上が 80 → 6（上限）', () => expect(keyAdvice(notesAt(80), range)).toBe(6));
  it('range が null → 0', () => expect(keyAdvice(notesAt(80), null)).toBe(0));
  it('音が無い → 0', () => expect(keyAdvice([], range)).toBe(0));
});

describe('mixToMono', () => {
  it('チャンネルを平均する', () => {
    const ch = [new Float32Array([1, 0]), new Float32Array([0, 1])];
    const buf = { numberOfChannels: 2, length: 2, getChannelData: (i) => ch[i] };
    expect(Array.from(mixToMono(buf))).toEqual([0.5, 0.5]);
  });
});
