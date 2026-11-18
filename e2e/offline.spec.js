// 電波がなくても開けるか（サービスワーカーが本番のビルドでだけ働く）
import { test, expect } from '@playwright/test';

test('1回開いたあと電波を切って再読み込みしても、ホームが出て段1が鳴らせる画面まで進める', async ({ page, context }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('koetore.v1')) {
      localStorage.setItem('koetore.v1', JSON.stringify({
        version: 1, range: null, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: [], welcomed: true,
      }));
    }
  });
  await page.goto('/');
  // サービスワーカーが働き始め、このページを受け持つまで待つ
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'きょうの おすすめ' })).toBeVisible();

  await page.goto('/#stage1');
  await expect(page.getByRole('button', { name: /聞く/ })).toBeVisible();

  // ライセンスの全文も、電波なしで読める（先に保存されている）
  const licenses = await page.evaluate(async () => (await fetch('./licenses.txt')).text());
  expect(licenses).toContain('Copyright 2018-2021 Ian Johnson');
  expect(licenses).toContain('Copyright Fedor Indutny, 2017.');
});
