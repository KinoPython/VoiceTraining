import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

let tone;
let createSongPlayer;
let audios; // 作られた偽の audio（url ごと）
let rafCallbacks;
let revoke;

// 偽の audio：currentTime と timeupdate を手で動かす
function makeFakeAudio(url) {
  const audio = new EventTarget();
  audio.url = url;
  audio.currentTime = 0;
  audio.playbackRate = 1;
  audio.preservesPitch = false;
  audio.play = vi.fn(() => Promise.resolve());
  audio.pause = vi.fn();
  audios.push(audio);
  return audio;
}

// 偽のフレーム：flushRaf で1コマ進める
const raf = (cb) => {
  rafCallbacks.push(cb);
  return rafCallbacks.length;
};
const cancelRaf = vi.fn();
function flushRaf() {
  const cbs = rafCallbacks;
  rafCallbacks = [];
  cbs.forEach((cb) => cb());
}

const FILE = new Blob(['f']);
const VOCAL = new Blob(['v']);
const base = { fromSec: 10, toSec: 12, rate: 0.75, source: 'file', loop: false, speaker: false };

function make(opts = {}) {
  return createSongPlayer({
    fileBlob: FILE,
    vocalBlob: VOCAL,
    createAudio: makeFakeAudio,
    raf,
    cancelRaf,
    ...opts,
  });
}

beforeEach(async () => {
  vi.resetModules();
  audios = [];
  rafCallbacks = [];
  cancelRaf.mockClear();
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:fake-${(n += 1)}`);
  revoke = URL.revokeObjectURL = vi.fn();
  tone = await import('../../src/audio/tone.js');
  ({ createSongPlayer } = await import('../../src/audio/songPlayer.js'));
});
afterEach(() => {
  vi.useRealTimers();
  delete navigator.audioSession;
});

describe('songPlayer', () => {
  test('play は fromSec・rate・preservesPitch を audio に設定して再生する', async () => {
    const player = make();
    player.play(base);
    const a = audios[0];
    expect(a.currentTime).toBe(10);
    expect(a.playbackRate).toBe(0.75);
    expect(a.preservesPitch).toBe(true);
    expect(a.webkitPreservesPitch).toBe(true);
    expect(a.play).toHaveBeenCalledTimes(1);
    player.stop();
  });

  test('toSec を超えたら、loop でなければ pause して resolve する', async () => {
    const player = make();
    const p = player.play(base);
    audios[0].currentTime = 12.05;
    flushRaf();
    await p;
    expect(audios[0].pause).toHaveBeenCalled();
  });

  test('toSec を超えたら、loop なら fromSec に戻って続ける', async () => {
    const player = make();
    let done = false;
    player.play({ ...base, loop: true }).then(() => (done = true));
    audios[0].currentTime = 12.1;
    flushRaf();
    await Promise.resolve();
    expect(audios[0].currentTime).toBe(10);
    expect(audios[0].pause).not.toHaveBeenCalled();
    expect(done).toBe(false);
    player.stop();
  });

  test('timeupdate でも区間の終わりを見る', async () => {
    const player = make();
    const p = player.play(base);
    audios[0].currentTime = 13;
    audios[0].dispatchEvent(new Event('timeupdate'));
    await p;
    expect(audios[0].pause).toHaveBeenCalled();
  });

  test('onTime は tick のたびに currentSec を受け取る', () => {
    const player = make();
    const cb = vi.fn();
    player.onTime(cb);
    player.play(base);
    audios[0].currentTime = 10.5;
    flushRaf();
    expect(cb).toHaveBeenLastCalledWith(10.5);
    expect(player.currentSec()).toBe(10.5);
    player.stop();
  });

  test('speaker:true の再生中は playback、終わると借りを返して戻る', async () => {
    vi.useFakeTimers();
    navigator.audioSession = { type: 'play-and-record' };
    tone.setMicActive(true);
    const player = make();
    const p = player.play({ ...base, speaker: true });
    expect(navigator.audioSession.type).toBe('playback');
    player.stop();
    await p;
    vi.advanceTimersByTime(250);
    expect(navigator.audioSession.type).toBe('play-and-record');
  });

  test('speaker:false では借りない', () => {
    navigator.audioSession = { type: 'play-and-record' };
    const player = make();
    player.play({ ...base, speaker: false });
    expect(navigator.audioSession.type).toBe('play-and-record');
    player.stop();
  });

  test('stop は待っている play を resolve し、再生を止める', async () => {
    const player = make();
    const p = player.play(base);
    player.stop();
    await p;
    expect(audios[0].pause).toHaveBeenCalled();
  });

  test('再生中にもう一度 play すると、前の play は resolve して新しいのが始まる', async () => {
    const player = make();
    const p1 = player.play(base);
    const p2 = player.play({ ...base, fromSec: 20, toSec: 22 });
    await p1;
    expect(audios[0].currentTime).toBe(20);
    expect(audios[0].play).toHaveBeenCalledTimes(2);
    player.stop();
    await p2;
  });

  test('audio.play() が拒否されたら借りを返して play を reject する', async () => {
    vi.useFakeTimers();
    navigator.audioSession = { type: 'play-and-record' };
    tone.setMicActive(true);
    const err = new Error('NotAllowedError');
    const player = make({
      createAudio: (url) => {
        const a = makeFakeAudio(url);
        a.play = vi.fn(() => Promise.reject(err));
        return a;
      },
    });
    await expect(player.play({ ...base, speaker: true })).rejects.toBe(err);
    vi.advanceTimersByTime(250);
    expect(navigator.audioSession.type).toBe('play-and-record');
  });

  test('dispose は再生を止め、両方の Object URL を revoke する', async () => {
    const player = make();
    const p = player.play(base); // file の audio を作る
    player.play({ ...base, source: 'vocal' }); // vocal の audio も作る
    player.dispose();
    await p;
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(audios.every((a) => a.pause.mock.calls.length >= 1)).toBe(true);
  });

  test('vocalBlob が null で source:vocal なら file を使う', () => {
    const player = make({ vocalBlob: null });
    player.play({ ...base, source: 'vocal' });
    expect(audios).toHaveLength(1);
    expect(audios[0].url).toBe('blob:fake-1');
    expect(URL.createObjectURL).toHaveBeenCalledWith(FILE);
    player.stop();
  });

  test('fileBlob が null で source:file なら vocal を使う', () => {
    const player = make({ fileBlob: null });
    player.play(base);
    expect(URL.createObjectURL).toHaveBeenCalledWith(VOCAL);
    player.stop();
  });

  test('同じ source の audio は使い回す（lazy に1回だけ作る）', () => {
    const player = make();
    player.play(base);
    player.stop();
    player.play(base);
    expect(audios).toHaveLength(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    player.stop();
  });
});
