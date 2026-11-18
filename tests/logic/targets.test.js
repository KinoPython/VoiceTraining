import { describe, it, expect } from 'vitest';
import { toleranceFor, glideTarget, matchTarget } from '../../src/logic/targets.js';

const range = { comfort: 57, low: 50, high: 64 };

describe('toleranceFor', () => {
  it('レベルごとの帯の太さ', () => {
    expect(toleranceFor(0)).toBe(100);
    expect(toleranceFor(2)).toBe(100);
    expect(toleranceFor(3)).toBe(50);
    expect(toleranceFor(6)).toBe(30);
    expect(toleranceFor(10)).toBe(30);
  });
});

describe('glideTarget', () => {
  it('level 0 は下から上へ', () => {
    expect(glideTarget(0, 0, range)).toEqual({ targetMidi: 59, startFrom: 'below' });
    expect(glideTarget(1, 1, range).startFrom).toBe('below');
  });
  it('level 4 の奇数回は上から下へ', () => {
    expect(glideTarget(4, 1, range)).toEqual({ targetMidi: 53, startFrom: 'above' });
  });
  it('level 2 の偶数回は below', () => {
    expect(glideTarget(2, 2, range).startFrom).toBe('below');
  });
  it('範囲の外には出ない', () => {
    const narrow = { comfort: 57, low: 55, high: 59 };
    expect(glideTarget(10, 0, narrow).targetMidi).toBe(59);
    expect(glideTarget(10, 1, narrow).targetMidi).toBe(55);
  });
});

describe('matchTarget', () => {
  it('1000回ためしてもいつも範囲の中・距離の中', () => {
    for (let level = 0; level <= 10; level++) {
      for (let i = 0; i < 100; i++) {
        const t = matchTarget(level, i, range);
        expect(t).toBeGreaterThanOrEqual(range.low);
        expect(t).toBeLessThanOrEqual(range.high);
        expect(Math.abs(t - range.comfort)).toBeLessThanOrEqual(1 + level);
        expect(Number.isInteger(t)).toBe(true);
      }
    }
  });
  it('rand を差し替えられる', () => {
    expect(matchTarget(1, 0, range, () => 0)).toBe(55);
    expect(matchTarget(1, 0, range, () => 0.999)).toBe(59);
  });
});
