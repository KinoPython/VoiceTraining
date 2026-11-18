import { describe, test, expect } from 'vitest';
import { gapForLevel, makeListenTrial, listenResult } from '../../src/logic/listenTrial.js';

describe('gapForLevel', () => {
  test('level 0 は 7半音、上がるほど小さく、1で止まる', () => {
    expect(gapForLevel(0)).toBe(7);
    expect(gapForLevel(6)).toBe(1);
    expect(gapForLevel(9)).toBe(1);
  });
});

describe('makeListenTrial', () => {
  test('1000回まわしても条件を守る', () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) {
      const gap = 1 + (i % 12);
      const center = 40 + Math.random() * 36;
      const t = makeListenTrial(center, gap);
      expect(Math.abs(t.second - t.first)).toBe(gap);
      expect(t.answer).toBe(t.second > t.first ? 'high' : 'low');
      expect(Number.isInteger(t.first)).toBe(true);
      for (const m of [t.first, t.second]) {
        expect(m).toBeGreaterThanOrEqual(40);
        expect(m).toBeLessThanOrEqual(76);
      }
      seen.add(t.answer);
    }
    expect(seen).toEqual(new Set(['high', 'low']));
  });
  test('first は center の ±2 以内', () => {
    for (let i = 0; i < 200; i++) {
      expect(Math.abs(makeListenTrial(58, 5).first - 58)).toBeLessThanOrEqual(2);
    }
  });
  test('上の端では必ず low、下の端では必ず high', () => {
    for (let i = 0; i < 100; i++) {
      expect(makeListenTrial(76, 7).answer).toBe('low');
      expect(makeListenTrial(40, 7).answer).toBe('high');
    }
  });
});

describe('listenResult', () => {
  test('最後の6問の平均を四捨五入', () => {
    expect(listenResult([7, 6, 6, 5, 5, 4, 4, 3])).toBe(Math.round((6 + 5 + 5 + 4 + 4 + 3) / 6));
  });
  test('6問より少なくてもある分で平均', () => {
    expect(listenResult([4, 2])).toBe(3);
  });
});
