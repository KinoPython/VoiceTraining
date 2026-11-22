import { describe, it, expect } from 'vitest';
import { stabilityOf, outsideRange } from '../../src/logic/stability.js';

// 20ms ごとに ms の長さぶん、fn(i) の高さを読む
const run = (startT, ms, fn) => {
  const out = [];
  for (let i = 0; i * 20 <= ms; i++) out.push({ t: startT + i * 20, midi: fn(i) });
  return out;
};

describe('stabilityOf', () => {
  it('同じ高さを1秒 → steady', () => {
    const r = stabilityOf(run(0, 1000, () => 60));
    expect(r.label).toBe('steady');
    expect(r.medianCents).toBe(0);
    expect(r.stretches).toBe(1);
  });
  it('±60 セントでゆれる1秒 → wobbly', () => {
    const r = stabilityOf(run(0, 1000, (i) => 60 + (i % 2 ? 0.6 : -0.6)));
    expect(r.label).toBe('wobbly');
    expect(r.medianCents).toBe(60);
  });
  it('±40 セントでゆれる1秒 → some（標準偏差 40 は wobblyCents 50 以下）', () => {
    const r = stabilityOf(run(0, 1000, (i) => 60 + (i % 2 ? 0.4 : -0.4)));
    expect(r.label).toBe('some');
    expect(r.medianCents).toBe(40);
  });
  it('300ms だけの声 → none', () => {
    expect(stabilityOf(run(0, 300, () => 60))).toEqual({ label: 'none', medianCents: null, stretches: 0 });
  });
  it('null ばかり・空 → none', () => {
    expect(stabilityOf(run(0, 1000, () => null)).label).toBe('none');
    expect(stabilityOf([]).label).toBe('none');
  });
  it('2つのまとまりでは、長い方が重く効く', () => {
    // 長い（2秒）ゆれる声 + null のすきま + 短い（0.5秒）安定した声
    const long = run(0, 2000, (i) => 60 + (i % 2 ? 0.4 : -0.4));
    const gap = [{ t: 2020, midi: null }];
    const short = run(2040, 500, () => 62);
    const r = stabilityOf([...long, ...gap, ...short]);
    expect(r.stretches).toBe(2);
    // 重みつき平均 = (40*2000 + 0*500) / 2500 = 32（単純平均なら 20 で steady になってしまう）
    expect(r.medianCents).toBe(32);
    expect(r.label).toBe('some');
  });
  it('短いまとまりは捨てて、使えるものだけで決める', () => {
    const r = stabilityOf([...run(0, 1000, () => 60), { t: 1020, midi: null }, ...run(1040, 200, (i) => 70 + i)]);
    expect(r.stretches).toBe(1);
    expect(r.label).toBe('steady');
  });
});

describe('outsideRange', () => {
  const range = { low: 55, high: 67 };
  it('range なし → 0・0', () => {
    expect(outsideRange([{ t: 0, midi: 90 }], null)).toEqual({ above: 0, below: 0 });
  });
  it('上に3読み・下に2読み', () => {
    const rs = [68, 70, 80, 54, 40, 60, 67, 55].map((m, i) => ({ t: i * 20, midi: m }));
    rs.push({ t: 999, midi: null });
    expect(outsideRange(rs, range)).toEqual({ above: 3, below: 2 });
  });
});
