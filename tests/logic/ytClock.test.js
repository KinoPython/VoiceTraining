import { describe, it, expect } from 'vitest';
import { createSongClock, loopAction } from '../../src/logic/ytClock.js';

describe('createSongClock', () => {
  it('まだ読んでいなければ 0', () => {
    expect(createSongClock().estimate(1234)).toBe(0);
  });
  it('再生中は、読んだ時刻からの経過ぶん進める', () => {
    const c = createSongClock();
    c.update(10, 0, true, 1);
    expect(c.estimate(500)).toBe(10.5);
  });
  it('rate 0.5 なら半分の速さで進む', () => {
    const c = createSongClock();
    c.update(10, 0, true, 0.5);
    expect(c.estimate(1000)).toBe(10.5);
  });
  it('playing:false なら進まない', () => {
    const c = createSongClock();
    c.update(10, 0, false, 1);
    expect(c.estimate(5000)).toBe(10);
  });
  it('推定より 0.3 秒以上ずれたら、読んだ値に合わせなおす', () => {
    const c = createSongClock();
    c.update(10, 0, true, 1);
    c.update(20, 100, true, 1); // 推定 10.1 → 実際 20（飛んだ）
    expect(c.estimate(100)).toBe(20);
    expect(c.estimate(600)).toBe(20.5);
  });
  it('0.3 秒未満のずれなら、前の基準のまま滑らかに進む（時計が震えない）', () => {
    const c = createSongClock();
    c.update(10, 0, true, 1);
    c.update(10.2, 100, true, 1);
    expect(c.estimate(100)).toBeCloseTo(10.1, 5);
  });
});

describe('loopAction', () => {
  it('終わりに着いた: loop なら seek、でなければ stop', () => {
    expect(loopAction(12, 10, 12, true)).toBe('seek');
    expect(loopAction(12, 10, 12, false)).toBe('stop');
  });
  it('区間の中なら continue', () => {
    expect(loopAction(11.9, 10, 12, true)).toBe('continue');
  });
  it('区間より前に外れたら、loop なら seek、でなければ continue', () => {
    expect(loopAction(5, 10, 12, true)).toBe('seek');
    expect(loopAction(5, 10, 12, false)).toBe('continue');
  });
});
