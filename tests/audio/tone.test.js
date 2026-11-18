import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFakeAudioContext } from './fakes.js';

let fake;
let tone;
beforeEach(async () => {
  vi.resetModules();
  fake = installFakeAudioContext();
  tone = await import('../../src/audio/tone.js');
});
afterEach(() => {
  vi.useRealTimers();
  delete navigator.audioSession;
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

describe('iPhone のマナーモードと「中断」状態', () => {
  test('audioSession が auto なら playback にする（マイクなしの段1でも音が出るように）', () => {
    navigator.audioSession = { type: 'auto' };
    tone.getAudioContext();
    expect(navigator.audioSession.type).toBe('playback');
  });

  test('audioSession が play-and-record のときは変えない（マイク使用中）', () => {
    navigator.audioSession = { type: 'play-and-record' };
    tone.getAudioContext();
    expect(navigator.audioSession.type).toBe('play-and-record');
  });

  test('audioSession が無い端末でも例外にならない', () => {
    expect(() => tone.getAudioContext()).not.toThrow();
  });

  test('interrupted（電話などで中断）のときも resume する', () => {
    fake.ctx.state = 'interrupted';
    tone.getAudioContext();
    expect(fake.ctx.resume).toHaveBeenCalled();
  });

  test('running と closed のときは resume しない', () => {
    tone.getAudioContext();
    fake.ctx.resume.mockClear();
    fake.ctx.state = 'running';
    tone.getAudioContext();
    fake.ctx.state = 'closed';
    tone.getAudioContext();
    expect(fake.ctx.resume).not.toHaveBeenCalled();
  });

  test('resume が失敗しても、未処理のエラーにしない', async () => {
    fake.ctx.state = 'interrupted';
    fake.ctx.resume = vi.fn(() => Promise.reject(new Error('interrupted')));
    expect(() => tone.getAudioContext()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  test('onended が来なくても、長さ＋少しで playNote は終わる', async () => {
    vi.useFakeTimers();
    const p = tone.playNote(60, 500);
    fake.oscillators[0].onended = null; // 中断中の iPhone のように、終わりの知らせが来ない
    let done = false;
    p.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(700);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toBe(true);
  });

  test('onended と安全タイマーの両方が来ても、1回だけ終わる', async () => {
    vi.useFakeTimers();
    const resolved = vi.fn();
    tone.playNote(60, 100).then(resolved);
    await vi.advanceTimersByTimeAsync(1000); // stop の onended（0ms後）と安全タイマーの両方
    expect(resolved).toHaveBeenCalledTimes(1);
  });
});
