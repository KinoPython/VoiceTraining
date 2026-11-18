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
