import { describe, test, expect, beforeEach } from 'vitest';
import { register, start, resetRoutes } from '../../src/router.js';
import { renderHome } from '../../src/screens/home.js';
import { renderWarmup } from '../../src/screens/warmup.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const range = { comfort: 60, low: 55, high: 67, widened: false, measuredOn: '2026-11-18' };
const did1 = { date: '2026-11-18', stage: 1, tries: 5, successes: 3, value: 2 };

function seed(patch) {
  const base = { version: 1, range: null, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: [], welcomed: true };
  localStorage.setItem('koetore.v1', JSON.stringify({ ...base, ...patch }));
}

async function open(hash = '#home') {
  resetRoutes();
  history.replaceState(null, '', location.pathname);
  register('home', renderHome);
  register('warmup', renderWarmup);
  register('stage1', () => {});
  register('stage3', () => {});
  const root = document.createElement('div');
  location.hash = hash;
  await start(root);
  return root;
}

describe('ホーム', () => {
  beforeEach(() => localStorage.clear());

  test('初めのおすすめは段1', async () => {
    seed({});
    const root = await open();
    expect(root.querySelector('.recommend').textContent).toContain('聞き分け');
  });

  test('段1をして range があると、おすすめは段3', async () => {
    seed({ history: [did1], range });
    const root = await open();
    expect(root.querySelector('.recommend').textContent).toContain('すべらせて 止める');
  });

  test('段2をまだ測っていないと、段3〜5に一言が出る', async () => {
    seed({});
    const root = await open();
    const hint = '先に 声の 地図を 測ると、あなたの 高さで 練習できます';
    expect(root.textContent.split(hint).length - 1).toBe(4);
  });

  test('range があると、その一言は出ない', async () => {
    seed({ history: [did1], range });
    const root = await open();
    expect(root.textContent).not.toContain('先に 声の 地図');
  });

  test('「▶ はじめる」はまず warmup（next=おすすめの段）へ', async () => {
    seed({});
    const root = await open();
    [...root.querySelectorAll('button')].find((b) => b.textContent === '▶ はじめる').click();
    await settle();
    expect(location.hash).toBe('#warmup?next=stage1');
  });

  test('段6のカードが出て、おすすめは段6にならない', async () => {
    seed({ history: [did1], range, levels: { s1: 4, s3: 4, s4: 4, s5: 4 } });
    const root = await open();
    expect(root.querySelector('.others').textContent).toContain('段6「好きな 曲」');
    expect(root.querySelector('.recommend').textContent).toContain('短い メロディ');
  });

  test('下に 4つのリンクがある', async () => {
    seed({});
    const root = await open();
    for (const label of ['きろく', 'せってい', '安全の こと', '読みもの']) {
      expect([...root.querySelectorAll('button')].some((b) => b.textContent === label)).toBe(true);
    }
  });

  test('history に null がまじった記録でも、ホームが出る', async () => {
    seed({ history: [null, did1] });
    const root = await open();
    expect(root.querySelector('.recommend')).toBeTruthy();
  });
});
