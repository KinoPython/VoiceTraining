import { describe, test, expect } from 'vitest';
import { recommendStage } from '../../src/logic/recommend.js';

const base = () => ({
  version: 1, range: null, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: [], welcomed: false,
});
const range = { comfort: 60, low: 55, high: 67, widened: false, measuredOn: '2026-11-18' };
const did1 = { date: '2026-11-18', stage: 1, tries: 5, successes: 3, value: 2 };

describe('recommendStage', () => {
  test('初めは段1', () => expect(recommendStage(base())).toBe(1));

  test('段1をしたあと range が無ければ段2', () => {
    const s = base(); s.history.push(did1);
    expect(recommendStage(s)).toBe(2);
  });

  test('range あり・s3=0 → 段3', () => {
    const s = base(); s.history.push(did1); s.range = range;
    expect(recommendStage(s)).toBe(3);
  });

  test('s3=4・s4=0 → 段4', () => {
    const s = base(); s.history.push(did1); s.range = range; s.levels.s3 = 4;
    expect(recommendStage(s)).toBe(4);
  });

  test('s3=4・s4=4 → 段5', () => {
    const s = base(); s.history.push(did1); s.range = range; s.levels.s3 = 4; s.levels.s4 = 4;
    expect(recommendStage(s)).toBe(5);
  });
});
