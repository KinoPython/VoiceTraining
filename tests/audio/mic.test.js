import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  installFakeAudioContext, makeFakeStream, installFakeMediaDevices,
  removeMediaDevices, installFakeRaf, setVisibility,
} from './fakes.js';

let fake;
let raf;
let openMic;
beforeEach(async () => {
  vi.resetModules();
  fake = installFakeAudioContext();
  raf = installFakeRaf();
  setVisibility('visible');
  ({ openMic } = await import('../../src/audio/mic.js'));
});
afterEach(() => {
  delete globalThis.MediaRecorder;
  delete navigator.audioSession;
});

function domError(name) {
  const e = new Error(name);
  e.name = name;
  return e;
}

async function openOk(stream = makeFakeStream()) {
  installFakeMediaDevices(vi.fn(async () => stream));
  const result = await openMic();
  expect(result.ok).toBe(true);
  return { mic: result.mic, stream };
}

describe('openMic の失敗', () => {
  test('NotAllowedError は denied', async () => {
    installFakeMediaDevices(vi.fn(async () => { throw domError('NotAllowedError'); }));
    expect(await openMic()).toEqual({ ok: false, reason: 'denied' });
  });
  test('NotFoundError は nodevice', async () => {
    installFakeMediaDevices(vi.fn(async () => { throw domError('NotFoundError'); }));
    expect(await openMic()).toEqual({ ok: false, reason: 'nodevice' });
  });
  test('その他は other', async () => {
    installFakeMediaDevices(vi.fn(async () => { throw domError('AbortError'); }));
    expect(await openMic()).toEqual({ ok: false, reason: 'other' });
  });
  test('mediaDevices が無ければ unsupported', async () => {
    removeMediaDevices();
    expect(await openMic()).toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('openMic の成功', () => {
  test('補正オフで getUserMedia を呼び、context を resume する', async () => {
    const gum = vi.fn(async () => makeFakeStream());
    installFakeMediaDevices(gum);
    await openMic();
    expect(gum).toHaveBeenCalledWith({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    expect(fake.ctx.resume).toHaveBeenCalled();
    expect(fake.analysers[0].fftSize).toBe(2048);
  });

  test('navigator.audioSession があれば play-and-record にする', async () => {
    navigator.audioSession = { type: 'auto' };
    await openOk();
    expect(navigator.audioSession.type).toBe('play-and-record');
  });

  test('閉じたら audioSession を playback に戻す（マナーモードでも音が出るまま、録音の表示は消す）', async () => {
    navigator.audioSession = { type: 'auto' };
    const { mic } = await openOk();
    mic.close();
    expect(navigator.audioSession.type).toBe('playback');
  });

  test('画面を隠して閉じたときも playback に戻す', async () => {
    navigator.audioSession = { type: 'auto' };
    await openOk();
    setVisibility('hidden');
    expect(navigator.audioSession.type).toBe('playback');
  });
});

describe('close と画面を隠したとき', () => {
  test('close() で全トラックの stop が呼ばれる', async () => {
    const { mic, stream } = await openOk();
    mic.close();
    stream.tracks.forEach((t) => expect(t.stop).toHaveBeenCalledTimes(1));
  });

  test('close() を2回呼んでも例外にならない', async () => {
    const { mic, stream } = await openOk();
    mic.close();
    expect(() => mic.close()).not.toThrow();
    stream.tracks.forEach((t) => expect(t.stop).toHaveBeenCalledTimes(1));
  });

  test('画面が hidden になるとトラックが止まる', async () => {
    const { stream } = await openOk();
    setVisibility('hidden');
    stream.tracks.forEach((t) => expect(t.stop).toHaveBeenCalled());
  });

  test('close() で visibilitychange の見張りも外れる', async () => {
    const spy = vi.spyOn(document, 'removeEventListener');
    const { mic } = await openOk();
    mic.close();
    expect(spy.mock.calls.some(([type]) => type === 'visibilitychange')).toBe(true);
    spy.mockRestore();
  });

  test('close() で rAF が止まる', async () => {
    const { mic } = await openOk();
    mic.onFrame(() => {});
    expect(raf.pendingCount()).toBe(1);
    mic.close();
    expect(raf.pendingCount()).toBe(0);
  });
});

describe('onFrame', () => {
  test('440Hz の波を流すと MIDI 69 付近が cb に届く', async () => {
    const { mic } = await openOk();
    const samples = new Float32Array(2048);
    for (let i = 0; i < samples.length; i++) samples[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / 44100);
    fake.analysers[0].samples = samples;
    const got = [];
    mic.onFrame((midi, nowMs) => got.push([midi, nowMs]));
    for (let i = 0; i < 5; i++) raf.tick();
    expect(got.length).toBe(5);
    expect(Math.abs(got[4][0] - 69)).toBeLessThan(0.3);
    expect(typeof got[4][1]).toBe('number');
  });

  test('無音なら null', async () => {
    const { mic } = await openOk();
    fake.analysers[0].samples = new Float32Array(2048);
    const got = [];
    mic.onFrame((midi) => got.push(midi));
    raf.tick();
    expect(got).toEqual([null]);
  });
});

describe('録音', () => {
  test('MediaRecorder が無ければ stopTake は null', async () => {
    const { mic } = await openOk();
    mic.startTake();
    expect(await mic.stopTake()).toBeNull();
  });

  test('録って URL を返し、close で revoke する', async () => {
    class FakeRecorder {
      static isTypeSupported(t) { return t === 'audio/webm'; }
      constructor(stream, opts) { this.opts = opts; FakeRecorder.last = this; }
      start() {}
      stop() {
        this.ondataavailable({ data: new Blob(['x']) });
        this.onstop();
      }
    }
    globalThis.MediaRecorder = FakeRecorder;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    const { mic } = await openOk();
    mic.startTake();
    expect(FakeRecorder.last.opts.mimeType).toBe('audio/webm');
    expect(await mic.stopTake()).toBe('blob:fake');
    mic.close();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });
});

describe('レビュー指摘の修正', () => {
  test('onFrame の中で close() しても、その後コマが続かない', async () => {
    const { mic } = await openOk();
    const cb = vi.fn(() => mic.close());
    mic.onFrame(cb);
    raf.tick();
    expect(raf.pendingCount()).toBe(0);
    raf.tick();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('準備の途中で失敗したら、開いたトラックを止める', async () => {
    const stream = makeFakeStream();
    installFakeMediaDevices(vi.fn(async () => stream));
    fake.ctx.createAnalyser = () => { throw new Error('boom'); };
    const result = await openMic();
    expect(result).toEqual({ ok: false, reason: 'other' });
    stream.tracks.forEach((t) => expect(t.stop).toHaveBeenCalled());
  });

  test('AudioContext は getUserMedia より前に作る', async () => {
    let contextCreatedBeforeGum = false;
    let created = 0;
    globalThis.AudioContext = function F() { created += 1; return fake.ctx; };
    installFakeMediaDevices(vi.fn(async () => {
      contextCreatedBeforeGum = created > 0;
      return makeFakeStream();
    }));
    await openMic();
    expect(contextCreatedBeforeGum).toBe(true);
  });

  function installRecorder() {
    const recorders = [];
    class R {
      static isTypeSupported() { return true; }
      constructor() { this.state = 'inactive'; recorders.push(this); }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        if (this.ondataavailable) this.ondataavailable({ data: new Blob(['x']) });
        if (this.onstop) this.onstop();
      }
    }
    globalThis.MediaRecorder = R;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    return recorders;
  }

  test('close() は録音中のレコーダーを止め、stopTake は null', async () => {
    const recorders = installRecorder();
    const { mic } = await openOk();
    mic.startTake();
    mic.close();
    expect(recorders[0].state).toBe('inactive');
    expect(await mic.stopTake()).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  test('録音中にもう一度 startTake すると前のは捨てる', async () => {
    const recorders = installRecorder();
    const { mic } = await openOk();
    mic.startTake();
    mic.startTake();
    expect(recorders).toHaveLength(2);
    expect(recorders[0].state).toBe('inactive');
    expect(await mic.stopTake()).toBe('blob:fake');
  });

  test('MediaRecorder のコンストラクタが例外でも落ちない', async () => {
    globalThis.MediaRecorder = function Bad() { throw new Error('nope'); };
    const { mic } = await openOk();
    expect(() => mic.startTake()).not.toThrow();
    expect(await mic.stopTake()).toBeNull();
  });

  test('stop() が例外でも stopTake は null を返す', async () => {
    const recorders = installRecorder();
    const { mic } = await openOk();
    mic.startTake();
    recorders[0].stop = () => { throw new Error('bad state'); };
    expect(await mic.stopTake()).toBeNull();
  });

  test('onClosed：画面を隠すと hidden、close() だと closed で一度だけ', async () => {
    const a = await openOk();
    const cbA = vi.fn();
    a.mic.onClosed(cbA);
    setVisibility('hidden');
    a.mic.close();
    expect(cbA).toHaveBeenCalledTimes(1);
    expect(cbA).toHaveBeenCalledWith('hidden');

    setVisibility('visible');
    const b = await openOk();
    const cbB = vi.fn();
    b.mic.onClosed(cbB);
    b.mic.close();
    b.mic.close();
    expect(cbB).toHaveBeenCalledTimes(1);
    expect(cbB).toHaveBeenCalledWith('closed');
  });
});

describe('スピーカーを借りる仕組みとのつなぎ', () => {
  test('openMic 成功のあと、借りて返すと play-and-record に戻る', async () => {
    vi.useFakeTimers();
    try {
      navigator.audioSession = { type: 'auto' };
      const tone = await import('../../src/audio/tone.js');
      await openOk();
      const give = tone.borrowSpeaker();
      expect(navigator.audioSession.type).toBe('playback');
      give();
      await vi.advanceTimersByTimeAsync(200);
      expect(navigator.audioSession.type).toBe('play-and-record');
    } finally {
      vi.useRealTimers();
    }
  });

  test('close() のあとは、借りて返しても play-and-record に戻らない', async () => {
    vi.useFakeTimers();
    try {
      navigator.audioSession = { type: 'auto' };
      const tone = await import('../../src/audio/tone.js');
      const { mic } = await openOk();
      mic.close();
      const give = tone.borrowSpeaker();
      give();
      await vi.advanceTimersByTimeAsync(1000);
      expect(navigator.audioSession.type).toBe('playback');
    } finally {
      vi.useRealTimers();
    }
  });

  test('openMic が失敗したときは、マイクありとして扱わない', async () => {
    vi.useFakeTimers();
    try {
      navigator.audioSession = { type: 'auto' };
      const tone = await import('../../src/audio/tone.js');
      installFakeMediaDevices(vi.fn(async () => { throw domError('NotAllowedError'); }));
      await openMic();
      const give = tone.borrowSpeaker();
      give();
      await vi.advanceTimersByTimeAsync(1000);
      expect(navigator.audioSession.type).toBe('playback');
    } finally {
      vi.useRealTimers();
    }
  });
});
