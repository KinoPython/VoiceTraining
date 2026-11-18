import { describe, test, expect } from 'vitest';
import { detectPitch, createSmoother } from '../../src/logic/pitch.js';

// テスト用に、決まった高さの正弦波（きれいな音）を作る
function sine(hz, sr = 44100, n = 2048, amp = 0.3) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / sr);
  return out;
}

describe('detectPitch', () => {
  test('220Hz の音は 57 前後', () => {
    expect(Math.abs(detectPitch(sine(220), 44100) - 57)).toBeLessThan(0.2);
  });
  test('無音は null', () => {
    expect(detectPitch(new Float32Array(2048), 44100)).toBeNull();
  });
  test('小さすぎる音は null', () => {
    expect(detectPitch(sine(220, 44100, 2048, 0.005), 44100)).toBeNull();
  });
  test('雑音は null', () => {
    const noise = new Float32Array(2048).map(() => (Math.random() * 2 - 1) * 0.3);
    expect(detectPitch(noise, 44100)).toBeNull();
  });
  test('範囲の外の高さは null', () => {
    expect(detectPitch(sine(40), 44100)).toBeNull();
  });
  test('同じ長さを続けて測っても結果が同じ（検出器の使い回し）', () => {
    const a = detectPitch(sine(220), 44100);
    const b = detectPitch(sine(220), 44100);
    expect(b).toBeCloseTo(a, 6);
  });
});

describe('createSmoother', () => {
  test('一瞬のオクターブ跳びはならされる', () => {
    const s = createSmoother();
    let last;
    for (const m of [57, 57, 69, 57, 57]) last = s.push(m);
    expect(last).toBe(57);
  });
  test('null が続けば null。1回だけの null なら前の値に近い値が出る', () => {
    const s = createSmoother();
    [57, 57, 57].forEach((m) => s.push(m));
    expect(s.push(null)).toBe(57);
    s.reset();
    let last;
    for (let i = 0; i < 5; i++) last = s.push(57);
    for (let i = 0; i < 3; i++) last = s.push(null);
    expect(last).toBeNull();
  });
  test('reset で履歴が消える', () => {
    const s = createSmoother();
    s.push(60);
    s.reset();
    expect(s.push(null)).toBeNull();
  });
});
