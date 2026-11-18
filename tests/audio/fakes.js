// 音まわりのテスト用の偽物。本物のマイク・スピーカーなしで動きを確かめるために使う。
import { vi } from 'vitest';

export function makeFakeContext() {
  const oscillators = [];
  const analysers = [];
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    state: 'suspended',
    destination: {},
    resume: vi.fn(async () => { ctx.state = 'running'; }),
    createOscillator() {
      const osc = {
        type: '',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        // 本物と同じく、止めたあとで onended が呼ばれる
        stop: vi.fn(() => setTimeout(() => osc.onended && osc.onended(), 0)),
        onended: null,
      };
      oscillators.push(osc);
      return osc;
    },
    createGain() {
      return {
        connect: vi.fn(),
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
      };
    },
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createAnalyser() {
      const analyser = {
        fftSize: 0,
        // テストが samples を差しかえると、その波が返る
        samples: null,
        getFloatTimeDomainData(buf) { if (analyser.samples) buf.set(analyser.samples); },
      };
      analysers.push(analyser);
      return analyser;
    },
  };
  return { ctx, oscillators, analysers };
}

// new AudioContext() で同じ偽物が返る「クラスのふり」
export function installFakeAudioContext() {
  const fake = makeFakeContext();
  globalThis.AudioContext = function FakeAudioContext() { return fake.ctx; };
  delete globalThis.webkitAudioContext;
  return fake;
}

export function makeFakeStream(trackCount = 2) {
  const tracks = Array.from({ length: trackCount }, () => ({ stop: vi.fn() }));
  return { tracks, getTracks: () => tracks };
}

export function installFakeMediaDevices(getUserMedia) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
}

export function removeMediaDevices() {
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
}

// requestAnimationFrame を手で1コマずつ進める偽物
export function installFakeRaf() {
  const pending = new Map();
  let nextId = 1;
  globalThis.requestAnimationFrame = (cb) => { pending.set(nextId, cb); return nextId++; };
  globalThis.cancelAnimationFrame = (id) => { pending.delete(id); };
  return {
    pendingCount: () => pending.size,
    tick() {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((cb) => cb(0));
    },
  };
}

export function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}
