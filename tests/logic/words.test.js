import { describe, it, expect } from 'vitest';
import { BANNED, findBanned } from '../../src/logic/words.js';

describe('findBanned', () => {
  it('禁止の言葉を見つける', () => {
    expect(findBanned('音痴が 治る')).toEqual(['治る']);
    expect(findBanned('少し 高め')).toEqual([]);
  });
  it('一覧は決まりどおり', () => {
    expect(BANNED).toEqual(['治る', '治す', '必ず', '絶対', '失敗', '不合格', 'ダメ', '連続', '日連続']);
  });
});
