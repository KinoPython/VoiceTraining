import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadYouTubeApi, createYtPlayer, ytErrorKey } from '../../src/audio/ytPlayer.js';
import { STAGE6_TEXT } from '../../src/data/copy.js';
import { findBanned } from '../../src/logic/words.js';

// 偽の YT.Player：コンストラクタの引数を記録し、テストから events を呼べる
function makeFakeYT({ rates = [0.25, 0.5, 0.75, 1] } = {}) {
  const made = [];
  class Player {
    constructor(el, opts) {
      this.el = el;
      this.opts = opts;
      this.calls = [];
      this.time = 0;
      this.dur = 200;
      this.rates = rates;
      this.destroy = vi.fn();
      made.push(this);
    }
    playVideo() { this.calls.push(['play']); }
    pauseVideo() { this.calls.push(['pause']); }
    seekTo(sec, ahead) { this.calls.push(['seek', sec, ahead]); }
    getCurrentTime() { return this.time; }
    getDuration() { return this.dur; }
    getAvailablePlaybackRates() { return this.rates; }
    setPlaybackRate(r) { this.calls.push(['rate', r]); }
  }
  return { Player, made, PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
}

describe('loadYouTubeApi', () => {
  let win;
  beforeEach(() => {
    win = {};
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  test('win.YT があれば loadScript を呼ばない', async () => {
    const YT = { Player: class {} };
    win.YT = YT;
    const loadScript = vi.fn();
    await expect(loadYouTubeApi({ loadScript, win })).resolves.toBe(YT);
    expect(loadScript).not.toHaveBeenCalled();
  });

  test('同時に2回呼んでも loadScript は1回、準備完了で resolve', async () => {
    const loadScript = vi.fn(() => Promise.resolve());
    const p1 = loadYouTubeApi({ loadScript, win });
    const p2 = loadYouTubeApi({ loadScript, win });
    await Promise.resolve();
    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadScript).toHaveBeenCalledWith('https://www.youtube.com/iframe_api');
    const YT = { Player: class {} };
    win.YT = YT;
    win.onYouTubeIframeAPIReady();
    await expect(p1).resolves.toBe(YT);
    await expect(p2).resolves.toBe(YT);
  });

  test('もとからある onYouTubeIframeAPIReady も呼ぶ', async () => {
    const prev = vi.fn();
    win.onYouTubeIframeAPIReady = prev;
    const p = loadYouTubeApi({ loadScript: () => Promise.resolve(), win });
    win.YT = { Player: class {} };
    win.onYouTubeIframeAPIReady();
    await p;
    expect(prev).toHaveBeenCalledTimes(1);
  });

  test('時間切れで YtTimeout、そのあと呼びなおすと再び読む', async () => {
    const loadScript = vi.fn(() => Promise.resolve());
    const p = loadYouTubeApi({ loadScript, win, timeoutMs: 1000 });
    const assertion = expect(p).rejects.toMatchObject({ name: 'YtTimeout' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    const p2 = loadYouTubeApi({ loadScript, win, timeoutMs: 1000 });
    p2.catch(() => {});
    await Promise.resolve();
    expect(loadScript).toHaveBeenCalledTimes(2);
  });

  test('loadScript が失敗 → YtLoadError、呼びなおすと再び loadScript が呼ばれる', async () => {
    const loadScript = vi.fn(() => Promise.reject(new Error('net')));
    await expect(loadYouTubeApi({ loadScript, win })).rejects.toMatchObject({ name: 'YtLoadError' });
    await expect(loadYouTubeApi({ loadScript, win })).rejects.toMatchObject({ name: 'YtLoadError' });
    expect(loadScript).toHaveBeenCalledTimes(2);
  });
});

describe('createYtPlayer', () => {
  const setup = async (opts = {}, yt = makeFakeYT()) => {
    const container = document.createElement('div');
    const onState = vi.fn();
    const onError = vi.fn();
    const p = createYtPlayer(container, { videoId: 'abc', YT: yt, onState, onError, ...opts });
    return { p, fake: yt.made[0], onState, onError, container };
  };

  test('host と playerVars が渡り、onReady で resolve', async () => {
    const { p, fake } = await setup();
    expect(fake.opts.host).toBe('https://www.youtube-nocookie.com');
    expect(fake.opts.videoId).toBe('abc');
    expect(fake.opts.playerVars.playsinline).toBe(1);
    fake.opts.events.onReady();
    const player = await p;
    expect(typeof player.play).toBe('function');
  });

  test('onReady の前の onError(101) は YtPlayerError で reject', async () => {
    const { p, fake } = await setup();
    fake.opts.events.onError({ data: 101 });
    await expect(p).rejects.toMatchObject({ name: 'YtPlayerError', code: 101 });
  });

  test('onReady のあとの onError は onError コールバックへ', async () => {
    const { p, fake, onError } = await setup();
    fake.opts.events.onReady();
    await p;
    fake.opts.events.onError({ data: 150 });
    expect(onError).toHaveBeenCalledWith(150);
  });

  test('状態の対応：1,2,0,3,5 は名前に、-1 は無視', async () => {
    const { p, fake, onState } = await setup();
    fake.opts.events.onReady();
    await p;
    for (const d of [1, 2, 0, 3, 5, -1]) fake.opts.events.onStateChange({ data: d });
    expect(onState.mock.calls.map((c) => c[0])).toEqual(['playing', 'paused', 'ended', 'buffering', 'cued']);
  });

  test('play / pause / seekTo / currentSec / duration', async () => {
    const { p, fake } = await setup();
    fake.opts.events.onReady();
    const player = await p;
    player.play();
    player.pause();
    player.seekTo(12.5);
    fake.time = 3.25;
    expect(player.currentSec()).toBe(3.25);
    expect(player.duration()).toBe(200);
    expect(fake.calls).toEqual([['play'], ['pause'], ['seek', 12.5, true]]);
    expect(player.availableRates()).toEqual([0.25, 0.5, 0.75, 1]);
  });

  test('setRate(0.6) は近い 0.5 か 0.75、同じ近さなら遅い方、返り値は実際の値', async () => {
    const { p, fake } = await setup();
    fake.opts.events.onReady();
    const player = await p;
    expect([0.5, 0.75]).toContain(player.setRate(0.6));
    expect(player.setRate(0.625)).toBe(0.5);
    expect(player.setRate(0.9)).toBe(1);
    expect(fake.calls.at(-1)).toEqual(['rate', 1]);
  });

  test('availableRates が空のとき setRate は 1 を返す', async () => {
    const { p, fake } = await setup({}, makeFakeYT({ rates: [] }));
    fake.opts.events.onReady();
    const player = await p;
    expect(player.setRate(0.5)).toBe(1);
  });

  test('destroy を2回呼んでも例外にならず、偽の destroy は1回', async () => {
    const { p, fake } = await setup();
    fake.opts.events.onReady();
    const player = await p;
    player.destroy();
    expect(() => player.destroy()).not.toThrow();
    expect(fake.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('ytErrorKey と案内文', () => {
  test('対応表', () => {
    expect(ytErrorKey(101)).toBe('notEmbeddable');
    expect(ytErrorKey(150)).toBe('notEmbeddable');
    expect(ytErrorKey(100)).toBe('notFound');
    expect(ytErrorKey(2)).toBe('badId');
    expect(ytErrorKey(153)).toBe('noReferer');
    expect(ytErrorKey(5)).toBe('other');
    expect(ytErrorKey(undefined)).toBe('other');
  });

  test('案内文に禁止語がない', () => {
    const keys = ['ytNotEmbeddable', 'ytNotFound', 'ytBadId', 'ytNoReferer', 'ytOther', 'ytOffline', 'ytEarphone', 'ytNotice'];
    for (const k of keys) {
      expect(typeof STAGE6_TEXT[k]).toBe('string');
      expect(findBanned(STAGE6_TEXT[k])).toEqual([]);
    }
  });
});
