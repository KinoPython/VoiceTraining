import { describe, test, expect, beforeEach, vi } from 'vitest';

// main.js の登録で、'vocalGuide' が本物の案内画面になっている（仮の画面ではない）
describe('main の画面登録', () => {
  beforeEach(() => {
    localStorage.setItem('koetore.v1', JSON.stringify({ version: 1, range: null, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: [], songs: [], welcomed: true }));
    document.body.innerHTML = '<div id="app"></div>';
    location.hash = '#vocalGuide';
  });

  test('#vocalGuide で、歌声だけのファイルの作り方が出る', async () => {
    await import('../../src/main.js');
    await new Promise((resolve) => setTimeout(resolve, 30));
    const t = document.getElementById('app').textContent;
    expect(t).toContain('歌声だけの ファイルの 作り方');
    expect(t).not.toContain('準備中');
  });

  test('#songYt が登録されている（YouTube の無い曲なら、つながずに一覧へのボタン）', async () => {
    location.hash = '#songYt?id=nothing';
    vi.resetModules(); // main.js を読みなおして、新しい #app に描かせる
    await import('../../src/main.js');
    await new Promise((resolve) => setTimeout(resolve, 30));
    const t = document.getElementById('app').textContent;
    expect(t).toContain('曲の 一覧へ');
    expect(t).not.toContain('きょうの');
  });
});
