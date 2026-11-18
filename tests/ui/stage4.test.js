import { describe, test, expect, beforeEach, vi } from 'vitest';
import { register, start, resetRoutes } from '../../src/router.js';
import { renderStage4 } from '../../src/screens/stage4.js';
import { findBanned } from '../../src/logic/words.js';
import { loadState, saveRange } from '../../src/storage/store.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const byLabel = (root, label) => [...root.querySelectorAll('button')].find((b) => b.textContent === label);

function makeMic(takeUrl = 'blob:take1') {
  let frame = null;
  return {
    onFrame: (cb) => { frame = cb; },
    onClosed: () => {},
    close: vi.fn(),
    startTake: vi.fn(),
    stopTake: vi.fn(async () => takeUrl),
    emit: (midi, now) => frame?.(midi, now),
  };
}

// 目標は rand=0.5 で comfort(55) ちょうど
const TARGET = 55;
function feed(mic, ms, midi, t0 = 0, step = 20) {
  for (let t = 0; t <= ms; t += step) mic.emit(midi, t0 + t);
}

let tone;
let waiter;
let audios;
async function open(mic) {
  resetRoutes();
  history.replaceState(null, '', location.pathname);
  tone = {
    resolve: null,
    playNote: vi.fn(() => new Promise((resolve) => { tone.resolve = resolve; })),
    stopAll: vi.fn(),
  };
  waiter = { resolve: null, wait: vi.fn(() => new Promise((resolve) => { waiter.resolve = resolve; })) };
  audios = [];
  const deps = {
    openMic: async () => ({ ok: true, mic }),
    ...tone,
    wait: waiter.wait,
    rand: () => 0.5,
    createAudio: (url) => { const a = { url, play: vi.fn(() => Promise.resolve()), pause: vi.fn(), onended: null }; audios.push(a); return a; },
  };
  register('stage4', (root, params) => renderStage4(root, params, deps));
  register('stage2', (root) => { root.textContent = '段2'; });
  register('home', (root) => { root.textContent = 'ホーム'; });
  const root = document.createElement('div');
  location.hash = '#stage4';
  await start(root);
  await settle();
  await click(root, 'マイクを ひらく');
  return root;
}
async function click(root, label) {
  byLabel(root, label).click();
  await settle();
}
// お手本→待ちを終えて判定が始まるところまで進める
async function beginTry(root) {
  await click(root, 'はじめる');
  tone.resolve();
  await settle();
  waiter.resolve();
  await settle();
}

describe('段4 1音合わせ', () => {
  beforeEach(() => {
    localStorage.clear();
    saveRange({ comfort: 55, low: 50, high: 60 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    URL.revokeObjectURL = vi.fn();
  });

  test('お手本が鳴っている間と待ちの間は、帯の中の値も数えない', async () => {
    const mic = makeMic();
    const root = await open(mic);
    await click(root, 'はじめる');
    expect(tone.playNote).toHaveBeenCalledWith(TARGET, 1500);
    feed(mic, 1500, TARGET);
    tone.resolve();
    await settle();
    expect(waiter.wait).toHaveBeenCalledWith(500);
    feed(mic, 1500, TARGET, 2000);
    expect(root.textContent).not.toContain('できた！');
    expect(mic.startTake).not.toHaveBeenCalled();
    waiter.resolve();
    await settle();
    expect(mic.startTake).toHaveBeenCalled();
    feed(mic, 1000, TARGET, 4000);
    await settle();
    expect(root.textContent).toContain('できた！');
  });

  test('目標の1オクターブ上で1秒 →「できた！」と「1つ 上の 高さで」', async () => {
    const mic = makeMic();
    const root = await open(mic);
    await beginTry(root);
    feed(mic, 1000, TARGET + 12);
    await settle();
    expect(root.textContent).toContain('できた！');
    expect(root.textContent).toContain('1つ 上の 高さで 合って いました');
  });

  test('1オクターブ下なら「1つ 下の 高さで」', async () => {
    const mic = makeMic();
    const root = await open(mic);
    await beginTry(root);
    feed(mic, 1000, TARGET - 12);
    await settle();
    expect(root.textContent).toContain('1つ 下の 高さで 合って いました');
  });

  test('録音できない（stopTake が null）ときは自分の声のボタンを出さない', async () => {
    const mic = makeMic();
    mic.stopTake = vi.fn(async () => null);
    const root = await open(mic);
    await beginTry(root);
    feed(mic, 1000, TARGET);
    await settle();
    expect(root.textContent).toContain('できた！');
    expect(byLabel(root, '自分の 声')).toBeUndefined();
    expect(byLabel(root, '続けて 聞く')).toBeUndefined();
    expect(byLabel(root, 'お手本')).toBeDefined();
    expect(byLabel(root, 'つぎへ')).toBeDefined();
  });

  test('時間切れは「おしい！」と向きを出し、禁止語を含まない', async () => {
    const mic = makeMic();
    const root = await open(mic);
    await beginTry(root);
    feed(mic, 6000, TARGET + 3);
    await settle();
    expect(root.textContent).toContain('おしい！');
    expect(root.textContent).toContain('少し 高めでした');
    expect(findBanned(root.textContent)).toEqual([]);
  });

  test('声が聞こえなかった時間切れは大きめの声を勧める', async () => {
    const mic = makeMic();
    const root = await open(mic);
    await beginTry(root);
    feed(mic, 6000, null);
    await settle();
    expect(root.textContent).toContain('声が 聞こえませんでした');
  });

  test('自分の声は <audio> で鳴らす。「つぎへ」で前の録音の URL を revoke する', async () => {
    const mic = makeMic();
    const root = await open(mic);
    await beginTry(root);
    feed(mic, 1000, TARGET);
    await settle();
    await click(root, '自分の 声');
    expect(audios[0].url).toBe('blob:take1');
    expect(audios[0].play).toHaveBeenCalled();
    await click(root, 'つぎへ');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:take1');
  });

  test('「続けて 聞く」はお手本のあとに自分の声', async () => {
    const mic = makeMic();
    const root = await open(mic);
    await beginTry(root);
    feed(mic, 1000, TARGET);
    await settle();
    tone.playNote.mockClear();
    await click(root, '続けて 聞く');
    expect(tone.playNote).toHaveBeenCalledWith(TARGET, 1500);
    expect(audios.length).toBe(0);
    tone.resolve();
    await settle();
    expect(audios[0].play).toHaveBeenCalled();
  });

  test('画面を離れると URL を revoke し、試した分を保存する', async () => {
    const mic = makeMic();
    const root = await open(mic);
    await beginTry(root);
    feed(mic, 1000, TARGET);
    await settle();
    location.hash = '#home';
    await settle();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:take1');
    expect(mic.close).toHaveBeenCalled();
    expect(loadState().history.at(-1)).toMatchObject({ stage: 4, tries: 1, successes: 1, value: null });
  });

  test('「おわる」で保存してホームへ', async () => {
    const mic = makeMic();
    const root = await open(mic);
    await beginTry(root);
    feed(mic, 6000, null);
    await settle();
    await click(root, 'おわる');
    expect(root.textContent).toBe('ホーム');
    expect(loadState().history.at(-1)).toMatchObject({ stage: 4, tries: 1, successes: 0 });
  });
});
