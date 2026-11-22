// 段6 好きな曲：曲を足す → 区間をなぞって保存 → 聞く → 一覧に戻る → 電波なしでも開く
import { test, expect } from '@playwright/test';

const SONG = 'e2e/fixtures/song.wav';

test('曲を足して区間を保存し、一覧に戻っても曲があり、電波なしでも曲の画面が開く', async ({ page, context }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    // 再読み込みのたびに書き戻さないよう、まだ無いときだけ書く
    if (!localStorage.getItem('koetore.v1')) {
      localStorage.setItem('koetore.v1', JSON.stringify({
        version: 1, range: null, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: [], welcomed: true,
      }));
    }
  });
  await page.goto('/#stage6');
  await expect(page.getByText('まだ 曲が ありません。')).toBeVisible();

  // 曲を足す（ファイル選びの入力は隠れているので、入力へ直接ファイルを渡す）
  await page.getByRole('button', { name: '＋ 曲を 足す' }).click();
  await page.getByLabel('曲名').fill('テスト曲');
  await page.locator('input[type=file][data-kind=file]').setInputFiles(SONG);
  await page.getByRole('button', { name: '追加する' }).click();

  // 線ができると、知らせの文があれば止まる（伴奏まざりの知らせ）。押して曲の画面へ
  const toSong = page.getByRole('button', { name: '曲の 画面へ' });
  const canvas = page.locator('canvas.song-overview');
  await expect(toSong.or(canvas)).toBeVisible({ timeout: 30000 });
  if (await toSong.isVisible()) await toSong.click();
  await expect(canvas).toBeVisible();
  const songUrl = page.url();

  // 線を指でなぞって区間を選ぶ（8px 以上動かすとタップではなくなぞりになる）
  const box = await canvas.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 5 });
  await page.mouse.up();

  await page.getByRole('button', { name: '区間を 保存' }).click();
  await expect(page.getByText('区間を 保存しました')).toBeVisible();
  await expect(page.getByRole('button', { name: '区間1' })).toBeVisible();

  // 「聞く」が押せて、止まったり「流せませんでした」が出たりしない
  const listen = page.getByRole('button', { name: '▶ 聞く' });
  await expect(listen).toBeEnabled();
  await listen.click();
  await page.waitForTimeout(500);
  await expect(page.getByText('曲を 流せませんでした')).toHaveCount(0);
  await page.getByRole('button', { name: '■ 止める' }).click();

  // 終えると一覧に戻り、曲がある
  await page.getByRole('button', { name: 'おわる' }).click();
  await expect(page.getByRole('button', { name: 'テスト曲' })).toBeVisible();

  // 電波を切って再読み込み。ファイルは IndexedDB にあるので、一覧も曲の画面も開ける
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'テスト曲' })).toBeVisible();
  await page.getByRole('button', { name: 'テスト曲' }).click();
  await expect(page.locator('canvas.song-overview')).toBeVisible();
  await expect(page.getByRole('button', { name: '区間1' })).toBeVisible();
  expect(page.url()).toBe(songUrl);
});
