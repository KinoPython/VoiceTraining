// 画面の流れのテスト。記録は localStorage（koetore.v1）に入るので、必要な状態を先に書いておく
import { test, expect } from '@playwright/test';

const KEY = 'koetore.v1';

// 開く前に記録の中身を用意する（welcomed: true なら はじめの画面を飛ばす）
async function seed(page, partial) {
  const state = {
    version: 1,
    range: null,
    levels: { s1: 0, s3: 0, s4: 0, s5: 0 },
    history: [],
    welcomed: true,
    ...partial,
  };
  // 再読み込みのたびに書き戻さないよう、まだ無いときだけ書く
  await page.addInitScript(([key, value]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, [KEY, JSON.stringify(state)]);
}

const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const recommended = (page) => page.locator('section.recommend');

test('はじめて開く → welcome → はじめる → home のおすすめは段1', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'こえトレへ ようこそ' })).toBeVisible();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(recommended(page)).toContainText('段1');
});

test('段1で20問答えると結果が出て、きろくに1件', async ({ page }) => {
  test.setTimeout(180000);
  await seed(page, {});
  await page.goto('/#stage1');
  for (let i = 0; i < 20; i += 1) {
    await page.getByRole('button', { name: /聞く/ }).click();
    // 2音が鳴り終わると答えられる。正解かどうかは問わない
    await page.getByRole('button', { name: '高い ↑' }).click({ timeout: 10000 });
    await page.getByRole('button', { name: 'つぎへ' }).click();
  }
  await expect(page.getByText('いま 聞き分けられる 差の 目安')).toBeVisible();
  await page.getByRole('button', { name: 'ホームへ' }).click();
  await page.getByRole('button', { name: 'きろく' }).click();
  await expect(page.getByText(/聞き分け　差の 目安/)).toHaveCount(1);
  expect((await stored(page)).history).toHaveLength(1);
});

test('段2を最後まで測ると、おすすめが段3になる', async ({ page }) => {
  test.setTimeout(120000);
  // 段1は済み、という状態から始める
  await seed(page, { history: [{ date: '2026-11-18', stage: 1, tries: 20, successes: 15, value: 3 }] });
  await page.goto('/#stage2');
  await page.getByRole('button', { name: 'マイクを ひらく' }).click();
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: 'はじめる' }).click();
    await expect(page.getByRole('button', { name: 'やり直す' })).toBeVisible();
    // 録り終わると次の手順（または結果）が出る
    await expect(page.getByRole('button', { name: /^(はじめる|段3へ)$/ })).toBeVisible({ timeout: 20000 });
  }
  // 偽マイクは 220Hz ＝ A3(57)。幅がせまいので広げた値 54〜60 になる
  await expect(page.getByText('楽な 高さ：ラ3')).toBeVisible();
  await expect(page.getByText('出せる 幅：ファ#3〜ド4')).toBeVisible();
  expect((await stored(page)).range).toMatchObject({ comfort: 57, low: 54, high: 60 });
  await page.getByRole('button', { name: 'ホームへ' }).click();
  await expect(recommended(page)).toContainText('段3');
});

test('段3：目標を 57 にそろえると「できた！」が出る', async ({ page }) => {
  test.setTimeout(60000);
  // level 0 の目標は comfort(55) + 2 = 57
  await seed(page, { range: { comfort: 55, low: 50, high: 60 } });
  await page.goto('/#stage3');
  await page.getByRole('button', { name: 'マイクを ひらく' }).click();
  await page.getByRole('button', { name: 'はじめる' }).click();
  await expect(page.getByText('できた！')).toBeVisible({ timeout: 15000 });
});
