// 段6② YouTube で練習：偽の YouTube プレーヤーで、曲を足す → 区間を決める → くり返す → 保存 → 一覧に戻る。
// 実際の YouTube には つながない（iframe_api を page.route で偽のスクリプトに差し替える）
import { test, expect } from '@playwright/test';

const API = 'https://www.youtube.com/iframe_api';

// 偽の YT.Player：onReady を呼び、再生中は内部の時計を進める。呼ばれた操作は window.__ytCalls に残す
const STUB = `
window.__ytCalls = [];
window.YT = {
  PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  Player: class {
    constructor(container, opts) {
      this.t = 0; this.rate = 1; this.playing = false; this.since = 0;
      this.events = opts.events || {};
      const box = document.createElement('div');
      box.className = 'fake-yt';
      box.style.cssText = 'width:100%;height:120px;background:#333';
      box.textContent = 'fake ' + opts.videoId;
      container.appendChild(box);
      this.box = box;
      window.__ytPlayer = this;
      setTimeout(() => this.events.onReady && this.events.onReady({ target: this }), 20);
    }
    now() { return this.playing ? this.t + ((performance.now() - this.since) / 1000) * this.rate : this.t; }
    playVideo() {
      window.__ytCalls.push('playVideo');
      if (!this.playing) { this.since = performance.now(); this.playing = true; }
      this.events.onStateChange && this.events.onStateChange({ data: 1 });
    }
    pauseVideo() {
      window.__ytCalls.push('pauseVideo');
      this.t = this.now(); this.playing = false;
      this.events.onStateChange && this.events.onStateChange({ data: 2 });
    }
    seekTo(sec) {
      window.__ytCalls.push('seekTo:' + sec);
      this.t = sec; this.since = performance.now();
    }
    getCurrentTime() { return this.now(); }
    getDuration() { return 225; }
    setPlaybackRate(r) { window.__ytCalls.push('rate:' + r); this.t = this.now(); this.since = performance.now(); this.rate = r; }
    getAvailablePlaybackRates() { return [0.5, 0.75, 1]; }
    destroy() { window.__ytCalls.push('destroy'); this.box.remove(); }
  },
};
if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
`;

// 本物のネットには出ない：localhost と youtube.com 以外への通信があれば集めて、最後に確かめる
function watchHosts(page) {
  const outside = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (!['http:', 'https:'].includes(u.protocol)) return; // data: や blob: は外に出ない
    const ok = u.hostname === 'localhost' || u.hostname === 'youtube.com' || u.hostname.endsWith('.youtube.com');
    if (!ok) outside.push(req.url());
  });
  return outside;
}

async function seedAndOpenList(page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('koetore.v1')) {
      localStorage.setItem('koetore.v1', JSON.stringify({
        version: 1, range: null, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: [], welcomed: true,
      }));
    }
  });
  await page.goto('/#stage6');
}

async function addYoutubeSong(page) {
  await page.getByRole('button', { name: '＋ 曲を 足す' }).click();
  await page.getByLabel('曲名').fill('ネット曲');
  await page.getByLabel('YouTube の アドレス（あとからでも 足せます）').fill('https://youtu.be/dQw4w9WgXcQ');
  await expect(page.getByText('動画から 曲を 取り出したり、録音したり しないで ください')).toBeVisible();
  await page.getByRole('button', { name: '追加する' }).click();
}

test('YouTube だけの曲を足し、区間を決めてくり返し、保存して一覧に戻ると ▶ の曲がある', async ({ page }) => {
  const outside = watchHosts(page);
  await page.route(API, (route) => route.fulfill({ contentType: 'text/javascript', body: STUB }));
  await seedAndOpenList(page);
  await addYoutubeSong(page);

  // 曲の画面（YouTube）が開き、偽のプレーヤーが作られる。YouTube に つながる お知らせも この画面に出る
  await expect(page.locator('.fake-yt')).toBeVisible();
  await expect(page.getByText('見た 動画などの 情報が YouTube（Google）の 決まりで 送られます')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ここを 始まりに' })).toBeVisible();

  // 10秒の所から流して、始まり・終わりを決める
  await page.evaluate(() => window.__ytPlayer.seekTo(10));
  await page.getByRole('button', { name: '▶ 再生' }).click();
  await page.getByRole('button', { name: 'ここを 始まりに' }).click();
  await page.waitForTimeout(1500); // 偽の時計が進む
  await page.getByRole('button', { name: 'ここを 終わりに' }).click();
  await expect(page.getByText(/区間：0:1\d\.\d 〜 0:1\d\.\d/)).toBeVisible();

  // くり返す：始まりへ戻して流し、偽の時計が区間の終わりを過ぎたら、また始まりへ戻す。
  // 押す直前に記録を空にして、押したあとの呼び出しだけを見る（前の操作の seekTo で通ってしまわないように）
  await page.evaluate(() => { window.__ytCalls = []; });
  await page.getByRole('button', { name: '▶ 区間を くり返す' }).click();
  const first = await page.evaluate(() => window.__ytCalls.slice(0, 2));
  expect(first[0]).toMatch(/^seekTo:1\d(\.\d+)?$/); // 区間の始まりへ
  expect(first[1]).toBe('playVideo');
  // 区間（約1.5秒）の終わりを過ぎると、同じ始まりへの seekTo がもう一度来る（くり返しの見張り）
  await expect.poll(
    () => page.evaluate((seek) => window.__ytCalls.slice(1).filter((c) => c === seek).length, first[0]),
    { timeout: 6000 },
  ).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: '■ 止める' }).click();

  // 速さ：0.5倍が選べる
  await page.getByRole('button', { name: '0.5倍' }).click();
  await expect.poll(() => page.evaluate(() => window.__ytCalls.includes('rate:0.5'))).toBe(true);

  // 区間を保存
  await page.getByRole('button', { name: '区間を 保存' }).click();
  await expect(page.getByText('区間を 保存しました')).toBeVisible();
  await expect(page.getByRole('button', { name: '区間1' })).toBeVisible();

  // 一覧に戻ると、▶ の印がついた曲がある
  await page.getByRole('button', { name: '曲の 一覧へ' }).click();
  await expect(page.getByRole('button', { name: 'ネット曲' })).toBeVisible();
  await expect(page.locator('.card', { has: page.getByRole('button', { name: 'ネット曲' }) })).toContainText('▶');

  expect(outside).toEqual([]);
});

test('YouTube の読み込みを断られると、電波のない時の案内が出る', async ({ page }) => {
  const outside = watchHosts(page);
  await page.route(API, (route) => route.abort());
  await seedAndOpenList(page);
  await addYoutubeSong(page);

  await expect(page.getByText('電波が ない ときは YouTube は 使えません')).toBeVisible({ timeout: 15000 });
  expect(outside).toEqual([]);
});
