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

describe('スピーカーを借りる（マイク使用中のお手本を下のスピーカーから）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigator.audioSession = { type: 'auto' };
    // 本物と同じく、予約した終わりの時刻に onended が来る（stop() だけ即座）。currentTime は 0 のまま
    const create = fake.ctx.createOscillator;
    fake.ctx.createOscillator = () => {
      const osc = create();
      osc.stop = vi.fn((when = 0) => setTimeout(() => osc.onended && osc.onended(), when * 1000));
      return osc;
    };
  });

  // マイクを開いた状態にする（mic.js がやることの再現）
  function micOpen() {
    tone.setMicActive(true);
    navigator.audioSession.type = 'play-and-record';
  }

  test('鳴らす間は playback、終わって 199ms は playback のまま、200ms で play-and-record に戻る', async () => {
    micOpen();
    const p = tone.playNote(60, 500);
    expect(navigator.audioSession.type).toBe('playback');
    await vi.advanceTimersByTimeAsync(500);
    await p;
    await vi.advanceTimersByTimeAsync(199);
    expect(navigator.audioSession.type).toBe('playback');
    await vi.advanceTimersByTimeAsync(1);
    expect(navigator.audioSession.type).toBe('play-and-record');
  });

  test('マイクなしなら、鳴り終わっても playback のまま', async () => {
    tone.setMicActive(false);
    const p = tone.playNote(60, 100);
    await vi.advanceTimersByTimeAsync(100);
    await p;
    await vi.advanceTimersByTimeAsync(1000);
    expect(navigator.audioSession.type).toBe('playback');
  });

  test('2音を続けて鳴らす間（1音目の終わりから100ms後に2音目）は戻らない', async () => {
    micOpen();
    const p1 = tone.playNote(60, 200);
    await vi.advanceTimersByTimeAsync(200);
    await p1;
    await vi.advanceTimersByTimeAsync(100);
    expect(navigator.audioSession.type).toBe('playback');
    const p2 = tone.playNote(62, 200);
    await vi.advanceTimersByTimeAsync(150); // 1音目の終わりから250ms。戻る予定は取り消されている
    expect(navigator.audioSession.type).toBe('playback');
    await vi.advanceTimersByTimeAsync(50);
    await p2;
    await vi.advanceTimersByTimeAsync(200);
    expect(navigator.audioSession.type).toBe('play-and-record');
  });

  test('playSequence の音の間（pause なし）でも戻らない', async () => {
    micOpen();
    const p = tone.playSequence([{ midi: 60, durationMs: 100 }, { midi: 62, durationMs: 100 }]);
    await vi.advanceTimersByTimeAsync(150);
    expect(navigator.audioSession.type).toBe('playback');
    await vi.advanceTimersByTimeAsync(100);
    await p;
    await vi.advanceTimersByTimeAsync(200);
    expect(navigator.audioSession.type).toBe('play-and-record');
  });

  test('鳴っている途中でマイクが閉じたら、あとで play-and-record に戻さない', async () => {
    micOpen();
    const p = tone.playNote(60, 500);
    await vi.advanceTimersByTimeAsync(100);
    tone.setMicActive(false); // mic.js の close() は playback にしてから知らせる
    navigator.audioSession.type = 'playback';
    await vi.advanceTimersByTimeAsync(400);
    await p;
    await vi.advanceTimersByTimeAsync(1000);
    expect(navigator.audioSession.type).toBe('playback');
  });

  test('stopAll で止めたら借りた分が返り、200ms で戻る', async () => {
    micOpen();
    const p = tone.playNote(60, 5000);
    const q = tone.playNote(64, 5000);
    tone.stopAll();
    await vi.advanceTimersByTimeAsync(0); // onended
    await Promise.all([p, q]);
    await vi.advanceTimersByTimeAsync(199);
    expect(navigator.audioSession.type).toBe('playback');
    await vi.advanceTimersByTimeAsync(1);
    expect(navigator.audioSession.type).toBe('play-and-record');
  });

  test('osc.stop が例外でも、stopAll は借りた分を返す', async () => {
    micOpen();
    const p = tone.playNote(60, 5000);
    fake.oscillators[0].stop = vi.fn(() => { throw new Error('already stopped'); });
    tone.stopAll();
    await p;
    await vi.advanceTimersByTimeAsync(200);
    expect(navigator.audioSession.type).toBe('play-and-record');
  });

  test('start が例外でも借りっぱなしにしない', async () => {
    micOpen();
    const original = fake.ctx.createOscillator;
    fake.ctx.createOscillator = () => {
      const osc = original.call(fake.ctx);
      osc.start = vi.fn(() => { throw new Error('bad'); });
      return osc;
    };
    await tone.playNote(60, 100); // 鳴らせなくても終わる
    await vi.advanceTimersByTimeAsync(200);
    expect(navigator.audioSession.type).toBe('play-and-record');
  });

  test('borrowSpeaker の返す関数を2回呼んでも、ほかの借りを返してしまわない', async () => {
    micOpen();
    const giveA = tone.borrowSpeaker();
    const giveB = tone.borrowSpeaker();
    giveA();
    giveA(); // 2回目は何もしない
    await vi.advanceTimersByTimeAsync(1000);
    expect(navigator.audioSession.type).toBe('playback'); // B がまだ借りている
    giveB();
    await vi.advanceTimersByTimeAsync(200);
    expect(navigator.audioSession.type).toBe('play-and-record');
  });

  test('借りるたびに playback にする（借り中に openMic が play-and-record を書いても、次の音は下のスピーカー）', async () => {
    micOpen();
    const giveA = tone.borrowSpeaker();
    navigator.audioSession.type = 'play-and-record'; // 借り中に openMic が書き換えた
    const giveB = tone.borrowSpeaker();
    expect(navigator.audioSession.type).toBe('playback');
    giveA();
    giveB();
  });

  test('whenSpeakerRestored：何も借りていなければすぐ resolve する', async () => {
    micOpen();
    let done = false;
    tone.whenSpeakerRestored().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  test('whenSpeakerRestored：借りている間と戻す予定の間は待ち、戻した時に resolve する', async () => {
    micOpen();
    const give = tone.borrowSpeaker();
    let done = false;
    tone.whenSpeakerRestored().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toBe(false); // まだ借りている
    give();
    await vi.advanceTimersByTimeAsync(199);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    expect(navigator.audioSession.type).toBe('play-and-record');
  });

  test('whenSpeakerRestored：待っている間にマイクが閉じたら resolve する', async () => {
    micOpen();
    const give = tone.borrowSpeaker();
    give();
    let done = false;
    tone.whenSpeakerRestored().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(50);
    tone.setMicActive(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  test('navigator.audioSession が無くても例外にならない', async () => {
    delete navigator.audioSession;
    tone.setMicActive(true);
    const p = tone.playNote(60, 100);
    await vi.advanceTimersByTimeAsync(100);
    await p;
    const give = tone.borrowSpeaker();
    expect(() => give()).not.toThrow();
    await vi.advanceTimersByTimeAsync(300);
  });
});
