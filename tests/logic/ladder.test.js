import { describe, test, expect } from 'vitest';
import { createLadder } from '../../src/logic/ladder.js';

describe('createLadder', () => {
  test('最初は level 0', () => {
    expect(createLadder().level).toBe(0);
  });
  test('2回続けてできたら level 1', () => {
    const l = createLadder();
    l.answer(true);
    expect(l.level).toBe(0);
    l.answer(true);
    expect(l.level).toBe(1);
  });
  test('○○× で 0 にもどる', () => {
    const l = createLadder();
    [true, true, false].forEach((ok) => l.answer(ok));
    expect(l.level).toBe(0);
  });
  test('× だけでは 0 のまま（マイナスにならない）', () => {
    const l = createLadder();
    l.answer(false);
    l.answer(false);
    expect(l.level).toBe(0);
  });
  test('1回外れたら連続も数えなおし（○×○ では上がらない）', () => {
    const l = createLadder();
    [true, false, true].forEach((ok) => l.answer(ok));
    expect(l.level).toBe(0);
  });
  test('上がったあとの成功は新しい連続の1回目', () => {
    const l = createLadder();
    [true, true, true].forEach((ok) => l.answer(ok));
    expect(l.level).toBe(1);
    l.answer(true);
    expect(l.level).toBe(2);
  });
  test('maxLevel を超えない', () => {
    const l = createLadder({ maxLevel: 2 });
    for (let i = 0; i < 20; i++) l.answer(true);
    expect(l.level).toBe(2);
  });
  test('answer は新しい level を返す', () => {
    const l = createLadder({ level: 3 });
    expect(l.answer(false)).toBe(2);
  });
});
