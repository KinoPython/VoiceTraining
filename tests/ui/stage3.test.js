import { describe, test, expect, beforeEach, vi } from 'vitest';
import { register, start, resetRoutes } from '../../src/router.js';
import { renderStage3 } from '../../src/screens/stage3.js';
import { findBanned } from '../../src/logic/words.js';
import { loadState, saveRange } from '../../src/storage/store.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const byLabel = (root, label) => [...root.querySelectorAll('button')].find((b) => b.textContent === label);

// 偽のマイク：テストから onFrame に値を流す
function makeMic() {
  let frame = null;
  let closed = null;
  return {
    onFrame: (cb) => { frame = cb; },
    onClosed: (cb) => { closed = cb; },
    close: vi.fn(),
    emit: (midi, now) => frame?.(midi, now),
    fireClosed: (reason) => closed?.(reason),
  };
}

// 目標は comfort(55)+2 = 57。帯は level 0 で ±100 cents
const TARGET = 57;

function feed(mic, ms, midi, t0 = 0, step = 20) {
  for (let t = 0; t <= ms; t += step) mic.emit(midi, t0 + t);
}

let tone;
async function open(mic, extra = {}) {
  resetRoutes();
  history.replaceState(null, '', location.pathname);
  tone = {
    resolve: null,
    playNote: vi.fn(() => new Promise((resolve) => { tone.resolve = resolve; })),
    stopAll: vi.fn(),
  };
  const deps = { openMic: async () => ({ ok: true, mic }), ...tone, ...extra };
  register('stage3', (root, params) => renderStage3(root, params, deps));
  register('stage2', (root) => { root.textContent = '段2'; });
  register('home', (root) => { root.textContent = 'ホーム'; });
  const root = document.createElement('div');
  location.hash = '#stage3';
  await start(root);
  await settle();
  return root;
}

async function click(root, label) {
  byLabel(root, label).click();
  await settle();
}

async function openAndStart(mic) {
  const root = await open(mic);
  await click(root, 'マイクを ひらく');
  return root;
}

describe('段3 すべらせて止める', () => {
  beforeEach(() => {
    localStorage.clear();
    saveRange({ comfort: 55, low: 50, high: 60 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  test('帯の中の声を1秒流すと「できた！」になり、成功が1つ増える', async () => {
    const mic = makeMic();
    const root = await openAndStart(mic);
    expect(root.textContent).toContain('帯より 下から');
    await click(root, 'はじめる');
    feed(mic, 1000, TARGET);
    await settle();
    expect(root.textContent).toContain('できた！');
    await click(root, 'おわる');
    const h = loadState().history.at(-1);
    expect(h).toMatchObject({ stage: 3, tries: 1, successes: 1, value: null });
  });

  test('帯より上の声には「少し 高め」が出る', async () => {
    const mic = makeMic();
    const root = await openAndStart(mic);
    await click(root, 'はじめる');
    feed(mic, 200, TARGET + 3);
    expect(root.textContent).toContain('少し 高め');
    feed(mic, 200, TARGET - 3, 300);
    expect(root.textContent).toContain('少し 低め');
  });

  test('2回できると次の目標は level 1 になる', async () => {
    const mic = makeMic();
    const root = await openAndStart(mic);
    expect(root.textContent).toContain('レベル 0');
    for (let i = 0; i < 2; i++) {
      await click(root, 'はじめる');
      feed(mic, 1000, TARGET);
      await settle();
      expect(root.textContent).toContain('できた！');
      await click(root, 'つぎへ');
    }
    expect(root.textContent).toContain('レベル 1');
  });

  test('時間切れは「おしい！」で、level 0 のまま下がらない', async () => {
    const mic = makeMic();
    const root = await openAndStart(mic);
    await click(root, 'はじめる');
    feed(mic, 10000, null);
    await settle();
    expect(root.textContent).toContain('おしい！ もう一度 ためして みましょう');
    expect(findBanned(root.textContent)).toEqual([]);
    await click(root, 'つぎへ');
    expect(root.textContent).toContain('レベル 0');
    await click(root, 'おわる');
    expect(loadState().history.at(-1)).toMatchObject({ tries: 1, successes: 0 });
    expect(loadState().levels.s3).toBe(0);
  });

  test('目標の音が鳴っている間は、帯の中の声もできたに数えない', async () => {
    const mic = makeMic();
    const root = await openAndStart(mic);
    await click(root, '▶ 目標の 音を 聞く');
    expect(tone.playNote).toHaveBeenCalledWith(TARGET, 1000);
    expect(byLabel(root, 'はじめる').disabled).toBe(true);
    feed(mic, 1500, TARGET);
    byLabel(root, 'はじめる').click();
    feed(mic, 1500, TARGET, 2000);
    expect(root.textContent).not.toContain('できた！');
    tone.resolve();
    await settle();
    expect(byLabel(root, 'はじめる').disabled).toBe(false);
    expect(root.textContent).not.toContain('できた！');
  });

  test('試している間は「目標の 音を 聞く」を押せない', async () => {
    const mic = makeMic();
    const root = await openAndStart(mic);
    await click(root, 'はじめる');
    expect(byLabel(root, '▶ 目標の 音を 聞く').disabled).toBe(true);
  });

  test('地図が無いときは、先に段2を勧める', async () => {
    localStorage.clear();
    const mic = makeMic();
    const root = await open(mic);
    expect(root.textContent).toContain('先に 声の 地図を 測ると');
    await click(root, '声の 地図へ');
    expect(root.textContent).toBe('段2');
  });

  test('画面を離れると mic.close と stopAll が呼ばれ、試した分が保存される', async () => {
    const mic = makeMic();
    const root = await openAndStart(mic);
    await click(root, 'はじめる');
    feed(mic, 10000, null);
    await settle();
    location.hash = '#home'; // 画面を移す（router が後始末を呼ぶ）
    await settle();
    expect(mic.close).toHaveBeenCalled();
    expect(tone.stopAll).toHaveBeenCalled();
    expect(loadState().history.at(-1)).toMatchObject({ stage: 3, tries: 1, successes: 0 });
    expect(loadState().levels.s3).toBe(0);
  });

  test('マイクが止まったら案内と「もう一度 マイクを ひらく」が出る', async () => {
    const mic = makeMic();
    const root = await openAndStart(mic);
    mic.fireClosed('hidden');
    await settle();
    expect(root.textContent).toContain('マイクが 止まりました。');
    await click(root, 'もう一度 マイクを ひらく');
    expect(root.textContent).toContain('帯より 下から');
  });

  test('試している途中で「おわる」を押しても、その1回は数えない', async () => {
    const mic = makeMic();
    const root = await openAndStart(mic);
    await click(root, 'はじめる');
    feed(mic, 200, TARGET - 3);
    await click(root, 'おわる');
    expect(loadState().history).toEqual([]);
    expect(root.textContent).toBe('ホーム');
  });

  test('結果画面で音を聞いて「つぎへ」を押すと、鳴り残りを止める', async () => {
    const mic = makeMic();
    const root = await openAndStart(mic);
    await click(root, 'はじめる');
    feed(mic, 10000, null);
    await settle();
    await click(root, '▶ 目標の 音を 聞く');
    tone.stopAll.mockClear();
    await click(root, 'つぎへ');
    expect(tone.stopAll).toHaveBeenCalled();
    expect(byLabel(root, 'はじめる').disabled).toBe(false);
  });
});
