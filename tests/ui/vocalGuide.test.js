import { describe, test, expect, beforeEach } from 'vitest';
import { renderVocalGuide } from '../../src/screens/vocalGuide.js';
import { findBanned } from '../../src/logic/words.js';
import { register } from '../../src/router.js';
import guide from '../../src/data/vocalGuide.json';

function open() {
  const root = document.createElement('div');
  renderVocalGuide(root);
  return root;
}

describe('歌声だけのファイルの作り方', () => {
  beforeEach(() => { location.hash = ''; });

  test('必ず入れる一文がある', () => {
    const t = open().textContent;
    expect(t).toContain('自分で 使う だけに して、人に 渡したり、SNS や 動画サイトに 上げたり しないで ください。');
    expect(t).toContain('私的使用・30条');
  });

  test('出典は https のリンクで、公式 GitHub を含む', () => {
    const links = [...open().querySelectorAll('details a')];
    expect(links.length).toBe(guide.sources.length);
    for (const a of links) expect(a.href.startsWith('https://')).toBe(true);
    expect(links.some((a) => a.href.includes('github.com/Anjok07/ultimatevocalremovergui'))).toBe(true);
  });

  test('見出し・手順・最終更新日が出る', () => {
    const root = open();
    const t = root.textContent;
    expect(t).toContain('パソコンで 曲の ファイルを 見つける');
    expect(t).toContain('歌声だけの ファイルを 作る');
    expect(t).toContain(`最終更新日：${guide.updatedOn}`);
    expect(root.querySelectorAll('ol li').length).toBe(guide.pcSongSteps.length + guide.steps.length);
  });

  test('保護を外さない・人に渡さない注意と、iTunes Plus の説明がある', () => {
    const t = open().textContent;
    expect(t).toContain('保護を 外す ことも しないで ください');
    expect(t).toContain('iTunes Plus');
    expect(t).toContain('共有フォルダや、リンクで の 共有には 入れないで ください');
    expect(t).toContain('安全の 設定を 切らないで ください');
  });

  test('禁止語が無い', () => {
    expect(findBanned(open().textContent)).toEqual([]);
  });

  test('「曲の 一覧へ もどる」で段6の一覧へ', () => {
    const root = open();
    register('stage6', () => {});
    [...root.querySelectorAll('button')].find((b) => b.textContent === '曲の 一覧へ もどる').click();
    expect(location.hash).toBe('#stage6');
  });
});
