import { describe, test, expect, beforeEach, vi } from 'vitest';
import { installFakeAudioContext } from './fakes.js';

let fake;
let tone;
beforeEach(async () => {
  vi.resetModules();
  fake = installFakeAudioContext();
  tone = await import('../../src/audio/tone.js');
});

describe('tone', () => {
  test('playNote(69, 500) は 440Hz のオシレーターを start/stop して resolve する', async () => {
    await tone.playNote(69, 500);
    expect(fake.oscillators).toHaveLength(1);
    const osc = fake.oscillators[0];
    expect(osc.frequency.value).toBeCloseTo(440, 5);
    expect(osc.type).toBe('triangle');
    expect(osc.start).toHaveBeenCalledTimes(1);
    expect(osc.stop).toHaveBeenCalledTimes(1);
  });

  test('AudioContext は1つだけ作って使い回し、resume する', () => {
    const a = tone.getAudioContext();
    const b = tone.getAudioContext();
    expect(a).toBe(b);
    expect(fake.ctx.resume).toHaveBeenCalled();
  });

  test('stopAll は鳴っているオシレーターをすべて止める', async () => {
    const p1 = tone.playNote(60, 5000);
    const p2 = tone.playNote(64, 5000);
    tone.stopAll();
    expect(fake.oscillators.every((o) => o.stop.mock.calls.length >= 1)).toBe(true);
    await Promise.all([p1, p2]);
  });

  test('playSequence は順番に鳴らし、stopAll で残りを鳴らさない', async () => {
    const p = tone.playSequence([
      { midi: 60, durationMs: 1000 },
      { midi: 62, durationMs: 1000 },
    ]);
    tone.stopAll();
    await p;
    expect(fake.oscillators).toHaveLength(1);
  });

  test('playSequence は全部の音を鳴らす', async () => {
    await tone.playSequence([
      { midi: 60, durationMs: 5 },
      { midi: 62, durationMs: 5 },
    ], 5);
    expect(fake.oscillators).toHaveLength(2);
  });
});
