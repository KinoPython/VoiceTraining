import { describe, it, expect } from 'vitest';
import { comfortFrom, edgeFrom, makeRange, clampToRange } from '../../src/logic/range.js';

describe('comfortFrom', () => {
  it('2000ms ぶん 57 前後なら 57', () => {
    const r = Array.from({ length: 125 }, (_, i) => 57 + (i % 3 === 0 ? 0.2 : -0.2));
    expect(comfortFrom(r, 16)).toBe(57);
  });
  it('500ms ぶんだけなら null', () => {
    expect(comfortFrom(Array(31).fill(57), 16)).toBeNull();
  });
  it('null（声なし）は時間に数えない', () => {
    expect(comfortFrom([...Array(100).fill(null), ...Array(30).fill(57)], 16)).toBeNull();
  });
});

describe('edgeFrom', () => {
  const slope = Array.from({ length: 13 }, (_, i) => 50 + i); // 50〜62
  it('裏返りの 80 を1つまぜても high は 80 にならない', () => {
    const high = edgeFrom([...slope, ...slope, ...slope, 80], 'high');
    expect(high).toBeLessThanOrEqual(62);
    expect(high).toBeGreaterThanOrEqual(60);
  });
  it('low は下の端あたり', () => {
    expect(edgeFrom([...slope, ...slope], 'low')).toBeLessThanOrEqual(51);
  });
  it('10個未満なら null', () => {
    expect(edgeFrom([50, 51, 52], 'low')).toBeNull();
    expect(edgeFrom([null, null, ...Array(8).fill(55)], 'high')).toBeNull();
  });
});

describe('makeRange', () => {
  it('幅が狭いと ±3 に広げる', () => {
    expect(makeRange(57, 55, 58)).toEqual({ comfort: 57, low: 54, high: 60, widened: true });
  });
  it('low が無ければ comfort−3', () => {
    expect(makeRange(57, null, 70)).toEqual({ comfort: 57, low: 54, high: 70, widened: false });
  });
  it('high が comfort より下なら comfort+3', () => {
    expect(makeRange(57, 50, 55).high).toBe(60);
  });
});

describe('clampToRange', () => {
  it('範囲に入れる', () => {
    const r = { comfort: 57, low: 50, high: 64 };
    expect(clampToRange(40, r)).toBe(50);
    expect(clampToRange(70, r)).toBe(64);
    expect(clampToRange(60, r)).toBe(60);
  });
});
