import { describe, test, expect, beforeEach, vi } from 'vitest';

// 線グラフの push の時刻を記録する（中身は本物のまま）
const graphLog = vi.hoisted(() => ({ pushes: [] }));
vi.mock('../../src/ui/pitchGraph.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createPitchGraph: (...args) => {
      const g = actual.createPitchGraph(...args);
      return { ...g, push: (now, midi) => { graphLog.pushes.push(now); g.push(now, midi); } };
    },
  };
});
import { register, start, resetRoutes, go } from '../../src/router.js';
import { renderStage5 } from '../../src/screens/stage5.js';
import { findBanned } from '../../src/logic/words.js';
import { loadState, saveRange } from '../../src/storage/store.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const byLabel = (root, label) => [...root.querySelectorAll('button')].find((b) => b.textContent === label);

function makeMic() {
  let frame = null;
  return {
    onFrame: (cb) => { frame = cb; },
    onClosed: () => {},
    close: vi.fn(),
    emit: (midi, now) => frame?.(midi, now),
  };
}

// rand=0.5・段0 → 「ド→レ→ド」。comfort 55 なので 53, 55, 53（1音 800ms、全体 2400ms）
const NOTES = [53, 55, 53];
let tone;
let waiter;
async function open(mic, rand = () => 0.5) {
  resetRoutes();
  history.replaceState(null, '', location.pathname);
  tone = { playNote: vi.fn(() => Promise.resolve()), stopAll: vi.fn() };
  waiter = { wait: vi.fn(() => Promise.resolve()) };
  const deps = { openMic: async () => ({ ok: true, mic }), ...tone, wait: waiter.wait, rand };
  register('stage5', (root, params) => renderStage5(root, params, deps));
  register('stage2', (root) => { root.textContent = '段2'; });
  register('home', (root) => { root.textContent = 'ホーム'; });
  const root = document.createElement('div');
  location.hash = '#stage5';
  await start(root);
  await settle();
  await click(root, 'マイクを ひらく');
  return root;
}
async function click(root, label) {
  byLabel(root, label).click();
  await settle();
}
// 歌いはじめ(t0)から、メロディ全体＋余白まで20msごとに流す。fn は (音の番号) → midi
function feedSong(mic, fn, t0 = 5000) {
  for (let t = 0; t <= 2800; t += 20) mic.emit(fn(Math.min(Math.floor(t / 800), 2)), t0 + t);
}

describe('段5 短いメロディ', () => {
  beforeEach(() => {
    localStorage.clear();
    saveRange({ comfort: 55, low: 50, high: 60 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  test('名前を出し、お手本は1音ずつ鳴らす', async () => {
    const root = await open(makeMic());
    expect(root.textContent).toContain('ド→レ→ド');
    await click(root, '▶ お手本');
    expect(tone.playNote.mock.calls.map((c) => c[0])).toEqual(NOTES);
    expect(tone.playNote.mock.calls[0][1]).toBe(800);
  });

  test('3・2・1 を1拍ずつ待ってから歌う', async () => {
    const root = await open(makeMic());
    await click(root, '歌う');
    expect(waiter.wait.mock.calls.map((c) => c[0])).toEqual([800, 800, 800]);
    expect(root.textContent).toContain('声を 出して ください');
  });

  test('お手本どおりなら「できた！」と100%前後', async () => {
    const mic = makeMic();
    const root = await open(mic);
    await click(root, '歌う');
    feedSong(mic, (i) => NOTES[i]);
    await settle();
    expect(root.textContent).toContain('できた！');
    expect(root.textContent).toContain('100%（目安）');
    expect(root.textContent).toContain('いまの 合いぐあい');
    expect(findBanned(root.textContent)).toEqual([]);
    for (const w of ['点', '採点', '不合格']) expect(root.textContent).not.toContain(w);
  });

  test('2つ目の音だけ1.5半音上なら、2つ目に「高め」', async () => {
    const mic = makeMic();
    const root = await open(mic);
    await click(root, '歌う');
    feedSong(mic, (i) => (i === 1 ? 56.5 : NOTES[i]));
    await settle();
    const rows = [...root.querySelectorAll('li')].map((li) => li.textContent);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('合って いた');
    expect(rows[1]).toContain('高め');
    expect(rows[2]).toContain('合って いた');
  });

  test('声が出ていないと「おしい！」と「声が 聞こえませんでした」', async () => {
    const mic = makeMic();
    const root = await open(mic);
    await click(root, '歌う');
    feedSong(mic, () => null);
    await settle();
    expect(root.textContent).toContain('おしい！ お手本を もう一度 聞いて みましょう');
    expect(root.textContent).toContain('声が 聞こえませんでした');
    expect(root.textContent).toContain('0%（目安）');
  });

  test('「もう一度」は同じメロディ、「つぎの メロディ」で選びなおす', async () => {
    // pickMelody は くじを2回引く。最初は ド→レ（0.9, 0）、あとで ド→レ→ド（0.9, 0.99）になるようにする
    let second = false;
    let calls = 0;
    const rand = () => (calls++ % 2 === 0 ? 0.9 : second ? 0.99 : 0);
    const mic = makeMic();
    const root = await open(mic, rand);
    expect(root.textContent).toContain('ド→レ');
    expect(root.textContent).not.toContain('ド→レ→ド');
    await click(root, '歌う');
    feedSong(mic, (i) => NOTES[i]);
    await settle();
    await click(root, 'もう一度');
    expect(root.textContent).toContain('ド→レ');
    expect(root.textContent).not.toContain('ド→レ→ド');
    await click(root, '歌う');
    feedSong(mic, (i) => NOTES[i], 20000);
    await settle();
    second = true;
    calls = 0;
    await click(root, 'つぎの メロディ');
    expect(root.textContent).toContain('ド→レ→ド');
  });

  test('お手本のあいだ、線グラフの時計は後ろに戻らない', async () => {
    graphLog.pushes.length = 0;
    const root = await open(makeMic());
    await click(root, '▶ お手本');
    const p = graphLog.pushes;
    expect(p.length).toBeGreaterThan(3);
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThanOrEqual(p[i - 1]);
  });

  test('おわるで記録を保存してホームへ（平均の合いぐあいを value に）', async () => {
    const mic = makeMic();
    const root = await open(mic);
    await click(root, '歌う');
    feedSong(mic, (i) => NOTES[i]);
    await settle();
    await click(root, 'おわる');
    expect(mic.close).toHaveBeenCalled();
    expect(loadState().history.at(-1)).toMatchObject({ stage: 5, tries: 1, successes: 1, value: 1 });
    expect(root.textContent).toContain('ホーム');
  });

  test('試していなければ履歴を残さない', async () => {
    const root = await open(makeMic());
    await click(root, 'おわる');
    expect(loadState().history).toHaveLength(0);
  });

  test('画面を移ると mic.close と stopAll', async () => {
    const mic = makeMic();
    await open(mic);
    tone.stopAll.mockClear();
    go('home');
    await settle();
    expect(mic.close).toHaveBeenCalled();
    expect(tone.stopAll).toHaveBeenCalled();
  });
});
