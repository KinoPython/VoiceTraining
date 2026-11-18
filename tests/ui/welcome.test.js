import { describe, test, expect, beforeEach } from 'vitest';
import { register, start, resetRoutes, setGuard } from '../../src/router.js';
import { loadState } from '../../src/storage/store.js';
import { renderWelcome, guardWelcome } from '../../src/screens/welcome.js';
import { renderSafety } from '../../src/screens/safety.js';
import { renderHome } from '../../src/screens/home.js';
import { renderWarmup } from '../../src/screens/warmup.js';
import { findBanned } from '../../src/logic/words.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

function setup() {
  resetRoutes();
  localStorage.clear();
  history.replaceState(null, '', location.pathname);
  register('home', renderHome);
  register('welcome', renderWelcome);
  register('safety', renderSafety);
  register('warmup', renderWarmup);
  setGuard(guardWelcome);
  return document.createElement('div');
}

describe('はじめての画面', () => {
  let root;
  beforeEach(() => { root = setup(); });

  test('welcomed が false なら #home でも welcome が出る', async () => {
    location.hash = '#home';
    await start(root);
    expect(root.textContent).toContain('こえトレへ ようこそ');
    expect(root.textContent).toContain('苦しい・痛いと 感じたら、すぐ やめましょう。');
  });

  test('「はじめる」で welcomed が true になり home へ', async () => {
    location.hash = '#home';
    await start(root);
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'はじめる').click();
    await settle();
    expect(loadState().welcomed).toBe(true);
    expect(root.textContent).toContain('きょうの おすすめ');
  });

  test('welcomed が true なら home がそのまま出る', async () => {
    localStorage.setItem('koetore.v1', JSON.stringify({ version: 1, welcomed: true }));
    location.hash = '#home';
    await start(root);
    expect(root.textContent).toContain('きょうの おすすめ');
  });

  test('safety は welcomed が false でも見られる', async () => {
    location.hash = '#safety';
    await start(root);
    expect(root.textContent).toContain('耳鼻咽喉科');
  });

  test.each(['welcome', 'safety', 'home', 'warmup'])('%s の文に禁止の言葉がない', async (name) => {
    localStorage.setItem('koetore.v1', JSON.stringify({ version: 1, welcomed: true }));
    location.hash = `#${name}`;
    await start(root);
    expect(root.textContent.length).toBeGreaterThan(20);
    expect(findBanned(root.textContent)).toEqual([]);
  });
});
