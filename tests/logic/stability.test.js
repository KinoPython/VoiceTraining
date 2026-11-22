import { describe, it, expect } from 'vitest';
import { CONFIG } from '../../src/logic/config.js';
import { stabilityOf, outsideRange, outsideFlags, spreadOf } from '../../src/logic/stability.js';

// 20ms ごとに ms の長さぶん、fn(i) の高さを読む
const run = (startT, ms, fn) => {
  const out = [];
  for (let i = 0; i * 20 <= ms; i++) out.push({ t: startT + i * 20, midi: fn(i) });
  return out;
};

// 声をとぎらせずに、いくつかの音を続けて歌う（レガート）。各音 ms ずつ、wobble(i) セントを足す
const legato = (notes, ms, wobble = () => 0) => {
  const out = [];
  notes.forEach((n, k) => {
    const start = k * (ms + 20);
    out.push(...run(start, ms, (i) => n + wobble(start / 20 + i) / 100));
  });
  return out;
};

// ビブラート：5.5Hz・±cents の波（20ms ごと）
const vibrato = (cents) => (i) => cents * Math.sin(2 * Math.PI * 5.5 * i * 0.02);
// ふらつき：5.5Hz の波を ±cents で頭打ちにした形（ほぼ ±cents に張りつくので、ふつうの波より ゆれが大きい）。
// （ふつうの波の ±70 は 標準偏差 約49 で、wobblyCents 50 の すぐ下に なるため）
const unsteady = (cents) => (i) => cents * Math.max(-1, Math.min(1, 1.5 * Math.sin(2 * Math.PI * 5.5 * i * 0.02)));

describe('stabilityOf', () => {
  it('同じ高さを1秒 → few', () => {
    const r = stabilityOf(run(0, 1000, () => 60));
    expect(r.label).toBe('few');
    expect(r.medianCents).toBe(0);
    expect(r.stretches).toBe(1);
  });
  it('±60 セントでゆれる1秒 → many', () => {
    const r = stabilityOf(run(0, 1000, (i) => 60 + (i % 2 ? 0.6 : -0.6)));
    expect(r.label).toBe('many');
    expect(r.medianCents).toBe(60);
  });
  it('±40 セントでゆれる1秒 → normal（標準偏差 40 は wobblyCents 50 以下）', () => {
    const r = stabilityOf(run(0, 1000, (i) => 60 + (i % 2 ? 0.4 : -0.4)));
    expect(r.label).toBe('normal');
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
    // 重みつき平均 = (40*2000 + 0*500) / 2500 = 32（単純平均なら 20 で few になってしまう）
    expect(r.medianCents).toBe(32);
    expect(r.label).toBe('normal');
  });
  it('短いまとまりは捨てて、使えるものだけで決める', () => {
    const r = stabilityOf([...run(0, 1000, () => 60), { t: 1020, midi: null }, ...run(1040, 200, (i) => 70 + i)]);
    expect(r.stretches).toBe(1);
    expect(r.label).toBe('few');
  });

  describe('音の変わり目で区切る（曲では声をとぎらせずに音が変わる）', () => {
    it('57・59・60 を 600ms ずつ、すきま無しで続ける → 3つに区切って few', () => {
      const r = stabilityOf(legato([57, 59, 60], 600));
      expect(r.stretches).toBe(3);
      expect(r.medianCents).toBe(0);
      expect(r.label).toBe('few');
    });
    it('同じ3音に ±30 セント・5.5Hz のビブラート → many には ならない', () => {
      const r = stabilityOf(legato([57, 59, 60], 600, vibrato(30)));
      expect(r.stretches).toBe(3);
      expect(['few', 'normal']).toContain(r.label);
    });
    it('同じ3音の中で ±70 セント ふらつく → many', () => {
      const r = stabilityOf(legato([57, 59, 60], 600, unsteady(70)));
      expect(r.stretches).toBe(3);
      expect(r.label).toBe('many');
    });
    it('まとまりの中の 1つだけ とんだ読み → 区切らず、ゆれも ふやさない', () => {
      const rs = run(0, 1000, () => 60);
      rs[25] = { ...rs[25], midi: 63 };
      const r = stabilityOf(rs);
      expect(r.stretches).toBe(1);
      expect(r.medianCents).toBe(0);
      expect(r.label).toBe('few');
    });
    it('2つ続けて とんだ読みも、3つ続かなければ 区切らない', () => {
      const rs = run(0, 1000, () => 60);
      rs[25] = { ...rs[25], midi: 64 };
      rs[26] = { ...rs[26], midi: 64 };
      const r = stabilityOf(rs);
      expect(r.stretches).toBe(1);
      expect(r.label).toBe('few');
    });
    it('±80 セントの 大きな ビブラート（5.5Hz）→ 山と谷で 細切れに せず、many（声が 無い とは しない）', () => {
      const r = stabilityOf(legato([57, 59, 60], 600, vibrato(80)));
      expect(r.stretches).toBe(3);
      expect(r.label).toBe('many');
    });
    it('速い 曲（240ms の 音が 8つ 続く）→ none に しない（声は 聞こえている）', () => {
      const r = stabilityOf(legato([57, 59, 60, 59, 57, 55, 57, 59], 240));
      expect(r.label).toBe('few');
      expect(r.stretches).toBe(8);
    });
    it('120ms の 短い 音（57 → 59 → 57）は ゆれに 入れない', () => {
      const rs = [...run(0, 600, () => 57), ...run(620, 120, () => 59), ...run(760, 600, () => 57)];
      expect(stabilityOf(rs).label).toBe('few');
    });
    it('300ms かけて 1半音 すべらせる（57 → 58） → many には ならない', () => {
      const slide = [];
      for (let i = 1; i <= 15; i++) slide.push({ t: 600 + i * 20, midi: 57 + i / 15 });
      const after = run(920, 600, () => 58);
      const r = stabilityOf([...run(0, 600, () => 57), ...slide, ...after]);
      expect(r.label).not.toBe('many');
      expect(r.label).not.toBe('none');
    });
  });
});

// 読みの間が gap ms（16ms ≒ 1秒に 約60回）で、ms の長さぶん fn(i) の高さを読む
const runAt = (gap, startT, ms, fn) => {
  const out = [];
  for (let i = 0; i * gap <= ms + 1e-9; i++) out.push({ t: startT + i * gap, midi: fn(i) });
  return out;
};

describe('伸ばす 所が 少ない 歌い方（速い 曲）', () => {
  it('130ms の 音を 16個 つなげて 歌う → short（メロディの 上下を ゆれと しない）', () => {
    const notes = [57, 59, 60, 62, 64, 62, 60, 59, 57, 59, 60, 62, 64, 65, 64, 62];
    const r = stabilityOf(legato(notes, 130));
    expect(r).toEqual({ label: 'short', medianCents: null, stretches: 0 });
  });
  it('120ms ずつの 半音の 音階 → short', () => {
    const notes = Array.from({ length: 16 }, (_, k) => 57 + k);
    expect(stabilityOf(legato(notes, 120)).label).toBe('short');
  });
  it('600ms の 音 1つ ＋ 短い 音 → 600ms の 音だけで 測る', () => {
    const long = run(0, 600, () => 57);
    const shorts = legato([59, 60, 62, 64, 62, 60], 130).map((r) => ({ ...r, t: r.t + 620 }));
    const r = stabilityOf([...long, ...shorts]);
    expect(r.stretches).toBe(1);
    expect(r.medianCents).toBe(0);
    expect(r.label).toBe('few');
  });
  it('声が 無いときは、これまでどおり none', () => {
    expect(stabilityOf(run(0, 1000, () => null)).label).toBe('none');
  });
});

describe('とんだ 読み・装飾音を、大きな ゆれと しない', () => {
  it('1.5秒の 同じ 高さの 中に、48ms だけ 12半音 とんだ 読み（16ms ごと 3読み）→ many に しない', () => {
    const rs = runAt(16, 0, 1500, () => 60);
    for (let i = 40; i < 43; i++) rs[i] = { ...rs[i], midi: 72 };
    expect(stabilityOf(rs).label).not.toBe('many');
  });
  it('6読み つづけて とんだ 読み（16ms ごと）→ many に しない', () => {
    const rs = runAt(16, 0, 1500, () => 60);
    for (let i = 40; i < 46; i++) rs[i] = { ...rs[i], midi: 72 };
    expect(stabilityOf(rs).label).not.toBe('many');
  });
  it('同じ 高さの 間に 80ms・2半音の 装飾音（57 → 59 → 57）→ many に しない', () => {
    const rs = [...run(0, 600, () => 57), ...run(620, 80, () => 59), ...run(720, 600, () => 57)];
    expect(stabilityOf(rs).label).not.toBe('many');
  });
  it('±60 セントの ビブラートは これまでどおり 1つの 音として 測る', () => {
    const r = stabilityOf(legato([57, 59, 60], 600, vibrato(60)));
    expect(r.stretches).toBe(3);
    expect(r.medianCents).toBeGreaterThanOrEqual(38);
    expect(r.medianCents).toBeLessThanOrEqual(46);
  });
  it('1つの まとまりの ゆれでは、中央値からの ずれを ±300 セントで 頭打ちに する', () => {
    // 59・61 が 半分ずつ と、1つだけ 2オクターブ とんだ 読み：とんだ 読みの ずれは 300 として 数える
    const st = [...Array.from({ length: 10 }, (_, i) => ({ t: i * 20, midi: i % 2 ? 61 : 59 })), { t: 200, midi: 84 }];
    const clamped = [...st.slice(0, 10), { t: 200, midi: 64 }]; // 中央値 61 から +300 に あたる 64
    expect(spreadOf(st)).toBeCloseTo(spreadOf(clamped), 6);
  });
});

describe('長さの 測り方・おかしな 読み', () => {
  it('1秒に 約60回の 読みで 400ms 歌った 音（24読み）→ 400ms と 数えて 測る（none に しない）', () => {
    const rs = Array.from({ length: 24 }, (_, i) => ({ t: (i * 1000) / 60, midi: 60 }));
    expect(stabilityOf(rs).label).toBe('few');
  });
  it('NaN・Infinity の 読みは 無視する（NaN を 出さない）', () => {
    const rs = run(0, 1000, () => 60);
    rs[10] = { ...rs[10], midi: NaN };
    rs[20] = { ...rs[20], midi: Infinity };
    rs[30] = { t: NaN, midi: 60 };
    const r = stabilityOf(rs);
    expect(r.label).toBe('few');
    expect(r.medianCents).toBe(0);
  });
  it('minVoicedMs が 0 でも、読み 1つで NaN に ならない', () => {
    const opts = { ...CONFIG.stage6.yt, minVoicedMs: 0, noteMinMs: 0, hopMs: 20 };
    const r = stabilityOf([{ t: 0, midi: 60 }], opts);
    expect(Number.isNaN(r.medianCents)).toBe(false);
    expect(r.label).toBe('few');
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

describe('outsideFlags（地図の外に、合わせて outsideMinMs 以上 出たか）', () => {
  const range = { low: 55, high: 67 };
  const opts = { outsideMinMs: 200, hopMs: 20 };
  it('range なし → どちらも false', () => {
    expect(outsideFlags(run(0, 1000, () => 90), null, opts)).toEqual({ above: false, below: false });
  });
  it('上に 9読み（180ms）だけ → 出さない。10読み（200ms） → 出す', () => {
    const nine = [...run(0, 400, () => 60), ...run(420, 160, () => 70)];
    expect(outsideFlags(nine, range, opts)).toEqual({ above: false, below: false });
    const ten = [...run(0, 400, () => 60), ...run(420, 180, () => 70)];
    expect(outsideFlags(ten, range, opts)).toEqual({ above: true, below: false });
  });
  it('下だけ 長く出た → below だけ true', () => {
    expect(outsideFlags(run(0, 1000, () => 50), range, opts)).toEqual({ above: false, below: true });
  });
  it('読みの間が 16ms（1秒に 約60回）のときは、読みの数ではなく時間で決める', () => {
    const rs = [];
    for (let i = 0; i < 40; i++) rs.push({ t: i * 16, midi: 60 });
    for (let i = 40; i < 52; i++) rs.push({ t: i * 16, midi: 70 }); // 12読み ≒ 192ms → まだ出さない
    expect(outsideFlags(rs, range, opts).above).toBe(false);
    for (let i = 52; i < 54; i++) rs.push({ t: i * 16, midi: 70 }); // 14読み ≒ 224ms → 出す
    expect(outsideFlags(rs, range, opts).above).toBe(true);
  });
});
