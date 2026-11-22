import { describe, it, expect } from 'vitest';
import { midiToY, createPitchGraph } from '../../src/ui/pitchGraph.js';

describe('midiToY', () => {
  it('低い音ほど下（height）、高い音ほど上（0）', () => {
    expect(midiToY(48, 48, 72, 240)).toBe(240);
    expect(midiToY(72, 48, 72, 240)).toBe(0);
    expect(midiToY(60, 48, 72, 240)).toBe(120);
  });
});

describe('createPitchGraph', () => {
  it('jsdom で getContext が無くても例外にならない', () => {
    const canvas = document.createElement('canvas');
    const g = createPitchGraph(canvas, { minMidi: 48, maxMidi: 72 });
    expect(() => {
      g.setBands([{ midi: 60, cents: 50 }]);
      g.setOk(true);
      g.push(100, 60);
      g.push(200, null);
      g.clear();
    }).not.toThrow();
  });

  // 描く命令を記録するだけの偽の絵筆
  function fakeCanvas(cssW = 300, cssH = 200) {
    const calls = [];
    const ctx = new Proxy({}, {
      get: (_, name) => (name === 'calls' ? calls : (...a) => calls.push([name, ...a])),
      set: () => true,
    });
    const canvas = document.createElement('canvas');
    canvas.getContext = () => ctx;
    Object.defineProperty(canvas, 'clientWidth', { value: cssW });
    Object.defineProperty(canvas, 'clientHeight', { value: cssH });
    return { canvas, calls };
  }

  it('devicePixelRatio 倍の実サイズにして、描く座標は CSS サイズのまま', () => {
    const old = window.devicePixelRatio;
    try {
      window.devicePixelRatio = 3;
      const { canvas, calls } = fakeCanvas(300, 200);
      const g = createPitchGraph(canvas, { minMidi: 48, maxMidi: 72 });
      g.clear();
      expect(canvas.width).toBe(900);
      expect(canvas.height).toBe(600);
      expect(calls.some((c) => c[0] === 'setTransform' && c[1] === 3 && c[4] === 3)).toBe(true);
      expect(canvas.classList.contains('pitch-graph')).toBe(true);
    } finally {
      window.devicePixelRatio = old;
    }
  });

  it('何度 push しても実サイズが増え続けない', () => {
    const old = window.devicePixelRatio;
    try {
      window.devicePixelRatio = 3;
      const { canvas } = fakeCanvas(300, 200);
      const g = createPitchGraph(canvas, { minMidi: 48, maxMidi: 72 });
      g.push(0, 60);
      const w = canvas.width;
      for (let i = 1; i <= 5; i++) g.push(i * 100, 60);
      expect(canvas.width).toBe(w);
    } finally {
      window.devicePixelRatio = old;
    }
  });

  it('null で線が切れる（moveTo が2回）、窓より古い点は捨てる', () => {
    const { canvas, calls } = fakeCanvas();
    const g = createPitchGraph(canvas, { minMidi: 48, maxMidi: 72, windowMs: 1000 });
    g.push(0, 60);
    g.push(100, 61);
    g.push(200, null);
    g.push(300, 62);
    g.push(400, 62);
    calls.length = 0;
    g.push(500, 62);
    const moves = calls.filter((c) => c[0] === 'moveTo').length;
    expect(moves).toBe(2);
    // 窓(1000ms)を超えたら先頭の点が消える
    calls.length = 0;
    g.push(1200, 62);
    const lineXs = calls.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo').map((c) => c[1]);
    expect(Math.min(...lineXs)).toBeGreaterThanOrEqual(0);
  });

  it('startMs/endMs つきの帯は窓の時間軸で x が決まる', () => {
    const { canvas, calls } = fakeCanvas(300, 200);
    const g = createPitchGraph(canvas, { minMidi: 48, maxMidi: 72, windowMs: 1000 });
    g.setBands([{ midi: 60, cents: 50, startMs: 500, endMs: 1000 }]);
    g.push(1000, null); // 今=1000 → 窓は 0..1000、右端が今
    const rects = calls.filter((c) => c[0] === 'fillRect');
    const band = rects.find((r) => Math.abs(r[1] - 150) < 1 && Math.abs(r[3] - 150) < 1);
    expect(band).toBeTruthy();
  });

  it('setGhost：jsdom で例外にならず、記録 ctx では muted の薄い線が描かれる', () => {
    const c = document.createElement('canvas');
    expect(() => createPitchGraph(c, { minMidi: 48, maxMidi: 72 }).setGhost([{ t: 0, midi: 60 }])).not.toThrow();
    const styles = [];
    const calls = [];
    const ctx = new Proxy({}, {
      get: (_, n) => (...a) => calls.push([n, ...a]),
      set: (_, n, v) => { if (n === 'strokeStyle') styles.push(v); return true; },
    });
    const canvas = document.createElement('canvas');
    canvas.getContext = () => ctx;
    document.documentElement.style.setProperty('--muted', '#123456');
    const g = createPitchGraph(canvas, { minMidi: 48, maxMidi: 72, windowMs: 1000 });
    g.setGhost([{ t: 0, midi: 60 }, { t: 100, midi: null }, { t: 500, midi: 62 }]);
    g.push(1000, null);
    expect(styles).toContain('#123456');
    g.setGhost(null);
    expect(() => g.push(1100, null)).not.toThrow();
    document.documentElement.style.removeProperty('--muted');
  });

  it('over: true の帯は --band-over の色', () => {
    const fills = [];
    const ctx = new Proxy({}, {
      get: () => () => {},
      set: (_, n, v) => { if (n === 'fillStyle') fills.push(v); return true; },
    });
    const canvas = document.createElement('canvas');
    canvas.getContext = () => ctx;
    document.documentElement.style.setProperty('--band-over', '#abcdef');
    createPitchGraph(canvas, { minMidi: 48, maxMidi: 72 }).setBands([{ midi: 60, cents: 50, over: true }]);
    expect(fills).toContain('#abcdef');
    document.documentElement.style.removeProperty('--band-over');
  });
});
