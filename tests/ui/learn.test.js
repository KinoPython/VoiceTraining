import { describe, test, expect, beforeEach } from 'vitest';
import { register, start, resetRoutes } from '../../src/router.js';
import { renderLearn, renderArticle } from '../../src/screens/article.js';
import { findBanned } from '../../src/logic/words.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const byLabel = (root, label) => [...root.querySelectorAll('button')].find((b) => b.textContent === label);

async function open(hash) {
  resetRoutes();
  history.replaceState(null, '', location.pathname);
  register('learn', renderLearn);
  register('article', (root, params) => renderArticle(root, params));
  const root = document.createElement('div');
  location.hash = hash;
  await start(root);
  return root;
}

describe('読みもの', () => {
  beforeEach(() => localStorage.clear());

  test('一覧に4本の題名が出る', async () => {
    const root = await open('#learn');
    const titles = [...root.querySelectorAll('.card strong')].map((e) => e.textContent);
    expect(titles).toEqual(['姿勢', '息の使い方', 'のどの力みを 抜く', '音程が 合わない 理由']);
  });

  test.each(['posture', 'breath', 'relax', 'pitch-ear'])('%s：記事が開き、出典・注意・日付が見える', async (id) => {
    const root = await open(`#article?id=${id}`);
    expect(root.querySelector('details.sources summary').textContent).toBe('出典');
    expect(root.querySelectorAll('details.sources a').length).toBeGreaterThan(0);
    expect(root.querySelector('details.sources a').href).toMatch(/^https:\/\//);
    expect(root.textContent).toContain('きょう やること');
    expect(root.textContent).toContain('耳鼻咽喉科');
    expect(root.textContent).toContain('最終更新日');
    expect(findBanned(root.textContent)).toEqual([]);
  });

  test('一覧の「読む」で記事のアドレスへ移る', async () => {
    const root = await open('#learn');
    byLabel(root, '読む').click();
    await settle();
    expect(location.hash).toBe('#article?id=posture');
  });

  test('知らない id でも行き止まりにならない', async () => {
    const root = await open('#article?id=nothing');
    expect(byLabel(root, '読みものへ もどる')).toBeTruthy();
  });
});
