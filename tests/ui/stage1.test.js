import { describe, test, expect, beforeEach, vi } from 'vitest';
import { register, start, resetRoutes, go } from '../../src/router.js';
import { renderStage1 } from '../../src/screens/stage1.js';
import { findBanned } from '../../src/logic/words.js';
import { loadState } from '../../src/storage/store.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const text = (root) => root.textContent;
const byLabel = (root, label) => [...root.querySelectorAll('button')].find((b) => b.textContent === label);

// rand を 0.3 に固定：1つ目は中心−1、答えは必ず「高い」になる
function makeDeps() {
  return {
    playSequence: vi.fn(() => Promise.resolve()),
    stopAll: vi.fn(),
    rand: () => 0.3,
  };
}

async function open(deps, hash = '#stage1') {
  resetRoutes();
  history.replaceState(null, '', location.pathname);
  register('stage1', (root, params) => renderStage1(root, params, deps));
  register('home', (root) => { root.textContent = 'ホーム'; });
  const root = document.createElement('div');
  location.hash = hash;
  await start(root);
  await settle(); // hash を先に変えたぶんの hashchange が落ち着くのを待つ
  return root;
}

async function click(root, label) {
  byLabel(root, label).click();
  await settle();
}

// 1問ぶん：聞く → 答える（答えは「高い」）→ つぎへ
async function playOne(root, label = '高い ↑') {
  await click(root, '▶ 聞く');
  await click(root, label);
}

// 答えのあとの鍵盤の印から、2音の差（半音）を読む
function gapShown(root) {
  const a = Number(root.querySelector('[data-kind="a"]').getAttribute('data-midi'));
  const b = Number(root.querySelector('[data-kind="b"]').getAttribute('data-midi'));
  return Math.abs(b - a);
}

describe('段1 聞き分け', () => {
  beforeEach(() => localStorage.clear());

  test('「▶ 聞く」を押すまで、答えのボタンは押せない', async () => {
    const root = await open(makeDeps());
    expect(byLabel(root, '高い ↑').disabled).toBe(true);
    expect(byLabel(root, '低い ↓').disabled).toBe(true);
    await click(root, '▶ 聞く');
    expect(byLabel(root, '高い ↑').disabled).toBe(false);
  });

  test('正しい答えを2回すると、次の問の差が6になる', async () => {
    const root = await open(makeDeps());
    await playOne(root); // 差7
    expect(gapShown(root)).toBe(7);
    await click(root, 'つぎへ');
    await playOne(root);
    expect(gapShown(root)).toBe(7);
    await click(root, 'つぎへ');
    await playOne(root);
    expect(gapShown(root)).toBe(6);
  });

  test('当たりは「当たり！」、外れは答えと励ましを出し、禁止の言葉がない', async () => {
    const root = await open(makeDeps());
    await playOne(root, '低い ↓');
    expect(text(root)).toContain('答えは『高い』でした。もう一度 聞いて みましょう');
    expect(findBanned(text(root))).toEqual([]);
    expect(text(root)).not.toMatch(/失敗|ダメ/);
    await click(root, 'つぎへ');
    await playOne(root);
    expect(text(root)).toContain('当たり！');
  });

  test('20問答えると結果が出て、記録が1つ残る', async () => {
    const root = await open(makeDeps());
    for (let i = 0; i < 20; i++) {
      await playOne(root);
      await click(root, 'つぎへ');
    }
    expect(text(root)).toContain('いま 聞き分けられる 差の 目安');
    const { history: h, levels } = loadState();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ stage: 1, tries: 20, successes: 20 });
    expect(h[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(levels.s1).toBeGreaterThan(0);
  });

  test('途中で「おわる」を押しても、答えた問があれば記録する', async () => {
    const root = await open(makeDeps());
    await playOne(root);
    await click(root, 'おわる');
    expect(loadState().history).toHaveLength(1);
    expect(loadState().history[0]).toMatchObject({ stage: 1, tries: 1, successes: 1 });
  });

  test('別の画面へ移ると、音を止める', async () => {
    const deps = makeDeps();
    await open(deps);
    go('home');
    await settle();
    expect(deps.stopAll).toHaveBeenCalled();
  });

  test('聞いたあとは「もう一度 聞く」に変わる', async () => {
    const root = await open(makeDeps());
    expect(byLabel(root, '▶ 聞く')).toBeTruthy();
    await click(root, '▶ 聞く');
    expect(byLabel(root, 'もう一度 聞く')).toBeTruthy();
    expect(byLabel(root, '▶ 聞く')).toBeUndefined();
  });

  test('結果の「もう一度」で、最初の問に戻る', async () => {
    const root = await open(makeDeps());
    await playOne(root);
    await click(root, 'おわる');
    await click(root, 'もう一度');
    expect(text(root)).toContain('1 / 20');
    expect(byLabel(root, '▶ 聞く')).toBeTruthy();
  });
});
