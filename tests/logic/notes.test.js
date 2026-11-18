import { describe, it, expect } from 'vitest';
import { hzToMidi, midiToHz, centsOff, foldOctave, noteLabel, gapLabel } from '../../src/logic/notes.js';

describe('hzToMidi / midiToHz', () => {
  it('A4=440Hz は 69', () => {
    expect(hzToMidi(440)).toBe(69);
    expect(hzToMidi(220)).toBe(57);
    expect(Math.abs(hzToMidi(261.63) - 60)).toBeLessThan(0.01);
    expect(midiToHz(69)).toBe(440);
  });
});

describe('centsOff', () => {
  it('半音の半分は 50 セント', () => {
    expect(centsOff(60.5, 60)).toBe(50);
  });
});

describe('foldOctave', () => {
  it('±600 セントの中にたたむ', () => {
    expect(foldOctave(1210)).toEqual({ cents: 10, octaveShift: 1 });
    expect(foldOctave(-1190)).toEqual({ cents: 10, octaveShift: -1 });
    expect(foldOctave(30)).toEqual({ cents: 30, octaveShift: 0 });
    expect(foldOctave(-30)).toEqual({ cents: -30, octaveShift: 0 });
  });
  it('はしは −600 以上 600 未満', () => {
    expect(foldOctave(600)).toEqual({ cents: -600, octaveShift: 1 });
    expect(foldOctave(-600)).toEqual({ cents: -600, octaveShift: 0 });
  });
});

describe('noteLabel', () => {
  it('60 は ド4', () => {
    expect(noteLabel(60)).toBe('ド4');
    expect(noteLabel(61)).toBe('ド#4');
    expect(noteLabel(57)).toBe('ラ3');
    expect(noteLabel(59.6)).toBe('ド4');
  });
});

describe('gapLabel', () => {
  it('半音の差を ドからの言葉で', () => {
    expect(gapLabel(1)).toBe('ドと ド#');
    expect(gapLabel(7)).toBe('ドと ソ');
    expect(gapLabel(11)).toBe('ドと シ');
    expect(gapLabel(12)).toBe('ドと 上の ド');
  });
});
