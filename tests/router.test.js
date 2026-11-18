import { describe, test, expect, beforeEach, vi } from 'vitest';
import { register, go, start, resetRoutes, setGuard } from '../src/router.js';

// hashchange は非同期で届くので、描画が終わるまで少し待つ
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('ルーター', () => {
  let root;
  beforeEach(() => {
    resetRoutes();
    // hash に '' を入れると遅れて hashchange が届くので、履歴を書きかえて初期化する
    history.replaceState(null, '', location.pathname);
    root = document.createElement('div');
  });

  test('#stage1 で stage1 の描画が呼ばれる', async () => {
    const stage1 = vi.fn();
    register('home', () => {});
    register('stage1', stage1);
    await start(root);
    location.hash = '#stage1?x=1';
    await settle();
    expect(stage1).toHaveBeenCalledTimes(1);
    const [el, params] = stage1.mock.calls[0];
    expect(root.contains(el)).toBe(true);
    expect(params.get('x')).toBe('1');
  });

  test('画面を移るとき前の画面の後始末が呼ばれる', async () => {
    const dispose = vi.fn();
    register('home', () => {});
    register('stage1', () => dispose);
    location.hash = '#stage1';
    await start(root);
    expect(dispose).not.toHaveBeenCalled();
    go('home');
    await settle();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test('知らない名前は home へ', async () => {
    const home = vi.fn();
    register('home', home);
    location.hash = '#nazo';
    await start(root);
    expect(home).toHaveBeenCalledTimes(1);
  });
});

describe('ルーターの見張り（setGuard）', () => {
  let root;
  beforeEach(() => {
    resetRoutes();
    history.replaceState(null, '', location.pathname);
    root = document.createElement('div');
  });

  test('見張りが別の名前を返したら、その画面を出す', async () => {
    const home = vi.fn();
    const welcome = vi.fn();
    register('home', home);
    register('welcome', welcome);
    setGuard((name) => (name === 'welcome' ? null : 'welcome'));
    location.hash = '#home';
    await start(root);
    expect(welcome).toHaveBeenCalledTimes(1);
    expect(home).not.toHaveBeenCalled();
    expect(location.hash).toBe('#welcome'); // 戻ったとき同じ画面に飛ばされないよう、URL も直す
  });

  test('null なら、そのまま出す', async () => {
    const home = vi.fn();
    register('home', home);
    setGuard(() => null);
    await start(root);
    expect(home).toHaveBeenCalledTimes(1);
  });

  test('いまと同じ画面へ go すると、後始末のあとで描きなおす', async () => {
    const dispose = vi.fn();
    const stage1 = vi.fn(() => dispose);
    register('home', () => {});
    register('stage1', stage1);
    location.hash = '#stage1';
    await start(root);
    await settle();
    const before = stage1.mock.calls.length; // 先に変えた hash の hashchange が混ざることがあるので、基準を取る
    const disposedBefore = dispose.mock.calls.length;
    go('stage1');
    await settle();
    expect(dispose.mock.calls.length).toBe(disposedBefore + 1);
    expect(stage1.mock.calls.length).toBe(before + 1);
  });
});
