import { describe, it, expect } from 'vitest';
import { renderKeyboard } from '../../src/ui/keyboard.js';

describe('renderKeyboard', () => {
  it('ド4〜ド5 は白鍵8個・黒鍵5個', () => {
    const svg = renderKeyboard({ fromMidi: 60, toMidi: 72, marks: [] });
    expect(svg.querySelectorAll('.kb-white').length).toBe(8);
    expect(svg.querySelectorAll('.kb-black').length).toBe(5);
  });

  it('marks の鍵に data-kind とクラスが付く', () => {
    const svg = renderKeyboard({ fromMidi: 60, toMidi: 72, marks: [{ midi: 64, kind: 'b' }] });
    const key = svg.querySelector('[data-midi="64"]');
    expect(key.getAttribute('data-kind')).toBe('b');
    expect(key.classList.contains('kb-b')).toBe(true);
    expect(svg.querySelectorAll('[data-kind]').length).toBe(1);
  });

  it('白鍵の下にドレミ。ドだけオクターブ付き', () => {
    const svg = renderKeyboard({ fromMidi: 60, toMidi: 72, marks: [] });
    const labels = [...svg.querySelectorAll('text')].map((t) => t.textContent);
    expect(labels).toEqual(['ド4', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ', 'ド5']);
  });
});
