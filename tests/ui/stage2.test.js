import { describe, test, expect, beforeEach, vi } from 'vitest';
import { register, start, resetRoutes, go } from '../../src/router.js';
import { renderStage2 } from '../../src/screens/stage2.js';
import { findBanned } from '../../src/logic/words.js';
import { loadState } from '../../src/storage/store.js';

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

async function open(openMic) {
  resetRoutes();
  history.replaceState(null, '', location.pathname);
  register('stage2', (root, params) => renderStage2(root, params, { openMic }));
  register('stage3', (root) => { root.textContent = '段3'; });
  register('home', (root) => { root.textContent = 'ホーム'; });
  const root = document.createElement('div');
  location.hash = '#stage2';
  await start(root);
  await settle();
  return root;
}

async function click(root, label) {
  byLabel(root, label).click();
  await settle();
}

// 1段ぶんの声を流す。values は 0〜1 の位置で決まる関数、または null
function feed(mic, ms, fn, t0 = 0, step = 20) {
  for (let t = 0; t <= ms; t += step) mic.emit(fn(t / ms), t0 + t);
}

describe('段2 声の地図', () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom は canvas を描けないので、描画は何もしない偽物に
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  test('マイクが使えないときは案内が出る', async () => {
    const root = await open(async () => ({ ok: false, reason: 'denied' }));
    await click(root, 'マイクを ひらく');
    expect(root.textContent).toContain('マイクが 使えません');
  });

  test('3つの手順を終えると範囲が保存され、結果が出る', async () => {
    const mic = makeMic();
    const root = await open(async () => ({ ok: true, mic }));
    expect(root.textContent).toContain('声の 高さを 測るため、マイクを 使います');
    await click(root, 'マイクを ひらく');
    expect(root.textContent).toContain('いちばん 楽な 声で');
    await click(root, 'はじめる');
    feed(mic, 3000, () => 57);
    await settle();
    expect(root.textContent).toContain('楽な 高さから、ゆっくり 下げて');
    await click(root, 'はじめる');
    feed(mic, 8000, (r) => 57 - 7 * r, 10000, 50);
    await settle();
    expect(root.textContent).toContain('ゆっくり 上げて');
    await click(root, 'はじめる');
    feed(mic, 8000, (r) => 57 + 6 * r, 20000, 50);
    await settle();
    const { range } = loadState();
    expect(range.comfort).toBe(57);
    expect(range.low).toBe(50);
    expect(range.high).toBe(63);
    expect(root.textContent).toContain('楽な 高さ：');
    expect(root.textContent).toContain('出せる 幅：');
    expect(loadState().history.at(-1)).toMatchObject({ stage: 2, value: 13 });
    expect(byLabel(root, '段3へ')).toBeTruthy();
    expect(byLabel(root, 'ホームへ')).toBeTruthy();
    expect(findBanned(root.textContent)).toEqual([]);
  });

  test('声が出ていないと、やり直しになり次へ進まない', async () => {
    const mic = makeMic();
    const root = await open(async () => ({ ok: true, mic }));
    await click(root, 'マイクを ひらく');
    await click(root, 'はじめる');
    feed(mic, 3000, () => null);
    await settle();
    expect(root.textContent).toContain('もう少し 長く 声を 出して みましょう');
    expect(root.textContent).not.toContain('ゆっくり 下げて');
    expect(byLabel(root, 'やり直す')).toBeTruthy();
    expect(loadState().range).toBeFalsy();
  });

  test('坂の途中に外れ値が1つあっても high は 63 前後', async () => {
    const mic = makeMic();
    const root = await open(async () => ({ ok: true, mic }));
    await click(root, 'マイクを ひらく');
    await click(root, 'はじめる');
    feed(mic, 3000, () => 57);
    await click(root, 'はじめる');
    feed(mic, 8000, (r) => 57 - 7 * r, 10000, 50);
    await click(root, 'はじめる');
    mic.emit(80, 20000);
    feed(mic, 8000, (r) => 57 + 6 * r, 20050, 50);
    expect(loadState().range.high).toBe(63);
  });

  test('画面を隠してマイクが止まったら案内が出て、ひらき直せる', async () => {
    const mics = [makeMic(), makeMic()];
    let n = 0;
    const root = await open(async () => ({ ok: true, mic: mics[n++] }));
    await click(root, 'マイクを ひらく');
    await click(root, 'はじめる');
    mics[0].fireClosed('hidden');
    await settle();
    expect(root.textContent).toContain('マイクが 止まりました。');
    await click(root, 'もう一度 マイクを ひらく');
    expect(root.textContent).toContain('いちばん 楽な 声で');
    expect(byLabel(root, 'はじめる')).toBeTruthy();
  });

  test('「マイクを ひらく」を2回すばやく押しても、開くマイクは1つで、離れると閉じる', async () => {
    const mics = [];
    const openMic = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5)); // 許可を待つ間のふり
      const mic = makeMic();
      mics.push(mic);
      return { ok: true, mic };
    });
    const root = await open(openMic);
    const first = byLabel(root, 'マイクを ひらく');
    first.click();
    first.click();
    await settle();
    expect(openMic).toHaveBeenCalledTimes(1);
    go('home');
    await settle();
    expect(mics.every((m) => m.close.mock.calls.length > 0)).toBe(true);
  });

  test('結果のあと「やり直す」でマイクを開き直し、1つ目の手順に戻る', async () => {
    const mics = [makeMic(), makeMic()];
    let n = 0;
    const root = await open(async () => ({ ok: true, mic: mics[n++] }));
    await click(root, 'マイクを ひらく');
    await click(root, 'はじめる');
    feed(mics[0], 3000, () => 57);
    await click(root, 'はじめる');
    feed(mics[0], 8000, (r) => 57 - 7 * r, 10000, 50);
    await click(root, 'はじめる');
    feed(mics[0], 8000, (r) => 57 + 6 * r, 20000, 50);
    await settle();
    expect(mics[0].close).toHaveBeenCalled();
    await click(root, 'やり直す');
    expect(n).toBe(2);
    expect(root.textContent).toContain('1 / 3');
    expect(root.textContent).toContain('いちばん 楽な 声で');
  });

  test('ほかの画面に移るとマイクが閉じる', async () => {
    const mic = makeMic();
    const root = await open(async () => ({ ok: true, mic }));
    await click(root, 'マイクを ひらく');
    go('home');
    await settle();
    expect(mic.close).toHaveBeenCalled();
  });
});
