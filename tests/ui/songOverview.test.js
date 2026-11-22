import { describe, it, expect, vi } from 'vitest';
import { xToSec, createSongOverview } from '../../src/ui/songOverview.js';

function makeCanvas(w = 300, h = 120) {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, name) => (name === 'calls' ? calls : (...a) => calls.push([name, ...a])),
    set: () => true,
  });
  const canvas = document.createElement('canvas');
  canvas.getContext = () => ctx;
  Object.defineProperty(canvas, 'clientWidth', { value: w });
  Object.defineProperty(canvas, 'clientHeight', { value: h });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h });
  return { canvas, calls };
}
function ptr(canvas, type, x) {
  const e = new Event(type, { bubbles: true });
  e.clientX = x;
  e.pointerId = 1;
  canvas.dispatchEvent(e);
}
const notes = [{ midi: 60, startMs: 0, endMs: 1000 }, { midi: 67, startMs: 2000, endMs: 3000 }];

describe('xToSec', () => {
  it('左端 0、右端 durationSec、範囲外は中に入れる', () => {
    expect(xToSec(0, 300, 240)).toBe(0);
    expect(xToSec(300, 300, 240)).toBe(240);
    expect(xToSec(-50, 300, 240)).toBe(0);
    expect(xToSec(999, 300, 240)).toBe(240);
  });
});

describe('createSongOverview', () => {
  it('なぞると onSelect(開始, 終わり)。逆向きでも同じ', () => {
    const { canvas } = makeCanvas();
    const onSelect = vi.fn();
    createSongOverview(canvas, { notes, durationSec: 240, onSelect });
    ptr(canvas, 'pointerdown', 30);
    ptr(canvas, 'pointermove', 50);
    ptr(canvas, 'pointerup', 60);
    expect(onSelect).toHaveBeenLastCalledWith(24, 48);
    ptr(canvas, 'pointerdown', 60);
    ptr(canvas, 'pointerup', 30);
    expect(onSelect).toHaveBeenLastCalledWith(24, 48);
  });
  it('動かさないタップ（8px 未満）は何も選ばない', () => {
    const { canvas } = makeCanvas();
    const onSelect = vi.fn();
    createSongOverview(canvas, { notes, durationSec: 240, onSelect });
    ptr(canvas, 'pointerdown', 30);
    ptr(canvas, 'pointerup', 34);
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('class と、選び・再生位置・音の描画', () => {
    const { canvas, calls } = makeCanvas();
    const o = createSongOverview(canvas, { notes, durationSec: 240, onSelect() {} });
    expect(canvas.classList.contains('song-overview')).toBe(true);
    calls.length = 0;
    o.setSelection(24, 48);
    o.setPlayhead(10);
    expect(calls.some((c) => c[0] === 'fillRect')).toBe(true);
    expect(calls.some((c) => c[0] === 'moveTo')).toBe(true);
  });
  it('なぞり途中で取り消される（pointercancel）と、仮の選びを消して前の選びで描きなおす', () => {
    const { canvas, calls } = makeCanvas();
    const onSelect = vi.fn();
    createSongOverview(canvas, { notes, durationSec: 240, onSelect });
    ptr(canvas, 'pointerdown', 30);
    ptr(canvas, 'pointermove', 90); // 仮の選びが描かれる
    calls.length = 0;
    ptr(canvas, 'pointercancel', 90);
    expect(calls.some((c) => c[0] === 'clearRect')).toBe(true); // 描きなおした
    expect(calls.some((c) => c[0] === 'fillRect')).toBe(false); // 前は選びが無かったので、帯は描かない
    ptr(canvas, 'pointermove', 120); // 取り消したあとは、動かしても選ばない
    ptr(canvas, 'pointerup', 120);
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('getContext が無くても例外にならない', () => {
    const canvas = document.createElement('canvas');
    const o = createSongOverview(canvas, { notes, durationSec: 240, onSelect() {} });
    expect(() => { o.setSelection(1, 2); o.setPlayhead(3); }).not.toThrow();
  });
  it('音が無い曲でも例外にならない', () => {
    const { canvas } = makeCanvas();
    expect(() => createSongOverview(canvas, { notes: [], durationSec: 10, onSelect() {} }).setPlayhead(1)).not.toThrow();
  });
});
