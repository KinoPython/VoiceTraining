import { describe, test, expect } from 'vitest';
import { tipNote } from '../../src/ui/tipNote.js';
import tips from '../../src/data/tips.json';

describe('tipNote', () => {
  test('💡 つきでコツを1つ出す', () => {
    const [el] = tipNote('s3', 0);
    expect(el.textContent).toBe('💡 ' + tips.s3[0]);
    expect(el.classList.contains('tip')).toBe(true);
    expect(el.classList.contains('note')).toBe(true);
  });

  test('一覧の長さでくり返し、マイナスは後ろから数える', () => {
    expect(tipNote('s3', tips.s3.length)[0].textContent).toBe('💡 ' + tips.s3[0]);
    expect(tipNote('s3', -1)[0].textContent).toBe('💡 ' + tips.s3[tips.s3.length - 1]);
  });

  test('一覧が空なら何も出さない', () => {
    expect(tipNote('s1', 0, [])).toEqual([]);
  });

  test('となり同士は同じ文にならない', () => {
    for (let i = 0; i < 9; i += 1) {
      expect(tipNote('s1', i)[0].textContent).not.toBe(tipNote('s1', i + 1)[0].textContent);
    }
  });
});
