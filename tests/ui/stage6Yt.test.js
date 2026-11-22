import { describe, test, expect, beforeEach, vi } from 'vitest';

// 線グラフの作り方・前回の線・声の地図の線を記録する（中身は本物のまま）
const graphLog = vi.hoisted(() => ({ options: [], ghosts: [], rangeLines: [] }));
vi.mock('../../src/ui/pitchGraph.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createPitchGraph: (canvas, options) => {
      graphLog.options.push(options);
      const g = actual.createPitchGraph(canvas, options);
      return {
        ...g,
        setGhost: (line) => { graphLog.ghosts.push(line); g.setGhost(line); },
        setRangeLines: (low, high) => { graphLog.rangeLines.push([low, high]); g.setRangeLines(low, high); },
      };
    },
  };
});
import { register, start, resetRoutes, go } from '../../src/router.js';
import { renderStage6Yt } from '../../src/screens/stage6Yt.js';
import { findBanned } from '../../src/logic/words.js';
import { addSong, getSong, loadState, saveRange } from '../../src/storage/store.js';
import { CONFIG } from '../../src/logic/config.js';
import { STAGE6_TEXT } from '../../src/data/copy.js';

// 実際の YouTube にはつながない。偽のプレーヤーと偽のタイマーを deps で渡す
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const byLabel = (root, label) => [...root.querySelectorAll('button')].find((b) => b.textContent === label);
const named = (name, extra = {}) => Object.assign(new Error(name), { name }, extra);

const FILE_SECTION = { id: 'f1', name: '区間1', startSec: 1, endSec: 3, lastLine: null, lastRatio: null };
const song = (patch = {}) => ({
  id: 's1', title: '曲Y', hasFile: false, hasVocal: false, durationSec: 0, keyAdvice: 0,
  sections: [], youtubeId: 'abcdefghijk', ytSections: [], ...patch,
});

// 偽の YtPlayer：位置は sec、長さは 225 秒（3:45）
function makePlayer() {
  const p = {
    sec: 0,
    rateResult: null, // setRate が返す「実際の速さ」。null なら頼んだ値
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn((s) => { p.sec = s; }),
    currentSec: () => p.sec,
    duration: () => 225,
    availableRates: () => [0.25, 0.5, 0.75, 1, 1.25],
    setRate: vi.fn((r) => (p.rateResult ?? r)),
    destroy: vi.fn(),
  };
  return p;
}

// 偽の setInterval / clearInterval：tick() で動いているタイマーを1回ずつ呼ぶ
function makeTimers() {
  const active = new Map();
  let next = 1;
  return {
    active,
    setInterval: vi.fn((fn, ms) => { const id = next++; active.set(id, { fn, ms }); return id; }),
    clearInterval: vi.fn((id) => { active.delete(id); }),
    tick: () => [...active.values()].forEach((t) => t.fn()),
  };
}

// 偽のマイク：emit(midi) で1コマ流す。hide() は「アプリを隠して止まった」
function makeMic() {
  let frame = null;
  let closed = null;
  return {
    onFrame: (cb) => { frame = cb; },
    onClosed: (cb) => { closed = cb; },
    close: vi.fn(),
    emit: (midi) => frame?.(midi, 0),
    hide: () => closed?.('hidden'),
  };
}

let player;
let timers;
let playerOpts;
let mic;
let openMic;
let nowMs; // 偽の時計（ms）
function makeDeps(patch = {}) {
  player = makePlayer();
  timers = makeTimers();
  playerOpts = null;
  mic = makeMic();
  openMic = vi.fn(async () => ({ ok: true, mic }));
  nowMs = 0;
  return {
    loadYouTubeApi: vi.fn(async () => ({ Player: function FakePlayer() {} })),
    createYtPlayer: vi.fn(async (container, opts) => { playerOpts = opts; return player; }),
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    now: () => nowMs,
    openMic,
    confirm: vi.fn(() => true),
    ...patch,
  };
}

async function open(deps, id = 's1') {
  resetRoutes();
  // hashchange を起こさずに URL を決める（起こすと画面が2回描かれ、偽のプレーヤーが2回作られる）
  history.replaceState(null, '', `${location.pathname}#songYt?id=${id}`);
  register('songYt', (root, params) => renderStage6Yt(root, params, deps));
  register('stage6', (root) => { root.textContent = '曲の一覧'; });
  register('home', (root) => { root.textContent = 'ホーム'; });
  const root = document.createElement('div');
  await start(root);
  await settle();
  return root;
}

async function click(root, label) {
  const b = byLabel(root, label);
  if (!b) throw new Error(`ボタンが ない：${label}`);
  b.click();
  await settle();
}

// 位置 a 秒で「ここを 始まりに」、b 秒で「ここを 終わりに」
async function mark(root, a, b) {
  player.sec = a;
  await click(root, 'ここを 始まりに');
  player.sec = b;
  await click(root, 'ここを 終わりに');
}

describe('段6② YouTube で聞く画面', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('曲名・YouTube の印・イヤホンの注意・プレーヤーの枠・位置と長さが出る', async () => {
    addSong(song());
    const deps = makeDeps();
    const root = await open(deps);
    expect(root.textContent).toContain('曲Y');
    expect(root.textContent).toContain('YouTube');
    expect(root.textContent).toContain('曲に 合わせて 歌う ときは、イヤホンが 必要です');
    expect(deps.createYtPlayer).toHaveBeenCalledTimes(1);
    const [container] = deps.createYtPlayer.mock.calls[0];
    expect(container.tagName).toBe('DIV');
    expect(root.contains(container)).toBe(true);
    expect(playerOpts.videoId).toBe('abcdefghijk');
    expect(playerOpts.signal).toBeInstanceOf(AbortSignal);
    expect(deps.loadYouTubeApi.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
    expect(root.textContent).toContain('0:00 / 3:45');
    expect(byLabel(root, '● 歌う')).toBeUndefined(); // 区間が決まるまで出さない
    expect(findBanned(root.textContent)).toEqual([]);
  });

  test('読み込み中は「読み込んで います」と出る', async () => {
    addSong(song());
    const root = await open(makeDeps({ loadYouTubeApi: vi.fn(() => new Promise(() => {})) }));
    expect(root.textContent).toContain('YouTube を 読み込んで います…');
  });

  test('loadYouTubeApi が YtTimeout → ytOffline と「もどる」。プレーヤーは作られない', async () => {
    addSong(song());
    const deps = makeDeps({ loadYouTubeApi: vi.fn(async () => { throw named('YtTimeout'); }) });
    const root = await open(deps);
    expect(root.textContent).toContain('電波が ない ときは YouTube は 使えません');
    expect(deps.createYtPlayer).not.toHaveBeenCalled();
    expect(byLabel(root, 'ここを 始まりに')).toBeUndefined();
    expect(findBanned(root.textContent)).toEqual([]);
    await click(root, 'もどる');
    expect(root.textContent).toBe('曲の一覧');
  });

  test('loadYouTubeApi が YtLoadError → ytOffline', async () => {
    addSong(song());
    const deps = makeDeps({ loadYouTubeApi: vi.fn(async () => { throw named('YtLoadError'); }) });
    const root = await open(deps);
    expect(root.textContent).toContain('電波が ない ときは YouTube は 使えません');
  });

  test('createYtPlayer が YtPlayerError(101) → ytNotEmbeddable と「もどる」', async () => {
    addSong(song());
    const deps = makeDeps({ createYtPlayer: vi.fn(async () => { throw named('YtPlayerError', { code: 101 }); }) });
    const root = await open(deps);
    expect(root.textContent).toContain('この 動画は 持ち主の 設定で、アプリの 中では 流せません');
    expect(byLabel(root, 'ここを 始まりに')).toBeUndefined();
    await click(root, 'もどる');
    expect(root.textContent).toBe('曲の一覧');
  });

  test('createYtPlayer が YtPlayerError(100) → ytNotFound', async () => {
    addSong(song());
    const deps = makeDeps({ createYtPlayer: vi.fn(async () => { throw named('YtPlayerError', { code: 100 }); }) });
    const root = await open(deps);
    expect(root.textContent).toContain('この 動画は 見つかりません。アドレスを 確かめて ください');
  });

  test('準備のあとに来たエラー（再生しようとして 150）でも案内を出し、プレーヤーを片づける', async () => {
    addSong(song());
    const root = await open(makeDeps());
    playerOpts.onError(150);
    await settle();
    expect(root.textContent).toContain('この 動画は 持ち主の 設定で、アプリの 中では 流せません');
    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(timers.active.size).toBe(0);
  });

  test('YouTube の無い曲・知らない曲でも止まらず、一覧へ戻れる', async () => {
    addSong(song({ youtubeId: null }));
    const deps = makeDeps();
    const root = await open(deps);
    expect(deps.loadYouTubeApi).not.toHaveBeenCalled();
    await click(root, '曲の 一覧へ');
    expect(root.textContent).toBe('曲の一覧');
  });

  test('位置 10 秒で「ここを 始まりに」、12 秒で「ここを 終わりに」→ 区間 10〜12 を保存できる', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await mark(root, 10, 12);
    expect(root.textContent).toContain('区間：0:10.0 〜 0:12.0');
    await click(root, '区間を 保存');
    expect(getSong('s1').ytSections).toMatchObject([{ name: '区間1', startSec: 10, endSec: 12, lastLine: null, lastRatio: null }]);
    expect(root.textContent).toContain('区間を 保存しました');
  });

  test('終わりが始まりより前なら保存できず案内する', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await mark(root, 12, 10);
    await click(root, '区間を 保存');
    expect(getSong('s1').ytSections).toEqual([]);
    expect(root.textContent).toContain('終わりは 始まりより 0.5秒 より 後ろに して ください');
    expect(findBanned(root.textContent)).toEqual([]);
  });

  test('区間を選ぶ前に保存・くり返し・端を動かすと、選ぶよう案内する', async () => {
    addSong(song());
    const root = await open(makeDeps());
    const PICK = '先に 「ここを 始まりに」「ここを 終わりに」で 区間を 選んで ください';
    await click(root, '区間を 保存');
    expect(root.textContent).toContain(PICK);
    expect(byLabel(root, '▶ 区間を くり返す')).toBeUndefined(); // 区間が決まるまで出さない
    await click(root, '始まりを 0.5秒 前へ');
    expect(root.textContent).toContain(PICK);
  });

  test('区間の端を 0.5秒ずつ動かせる。動画の外には出ず、短くなりすぎるときは動かない', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await mark(root, 0.2, 2);
    await click(root, '始まりを 0.5秒 前へ'); // 0 より前には出ない
    expect(root.textContent).toContain('区間：0:00.0 〜 0:02.0');
    await click(root, '終わりを 0.5秒 前へ');
    await click(root, '終わりを 0.5秒 前へ');
    await click(root, '終わりを 0.5秒 前へ'); // 1.0 → 0.5 は 0 < 0.5 − 0.5 にならないので動かない
    expect(root.textContent).toContain('区間：0:00.0 〜 0:01.0');
    player.sec = 224.8;
    await click(root, 'ここを 始まりに');
    player.sec = 225;
    await click(root, 'ここを 終わりに');
    await click(root, '始まりを 0.5秒 前へ'); // 224.3 → 224.3 < 225 − 0.5 なので動く
    await click(root, '終わりを 0.5秒 後ろへ'); // 動画の長さ 225 の外には出ない
    expect(root.textContent).toContain('区間：3:44.3 〜 3:45.0');
  });

  test('「区間を くり返す」→ seekTo(10) と play。位置が 12 を超えると seekTo(10)。止めると pause', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await mark(root, 10, 12);
    await click(root, '▶ 区間を くり返す');
    expect(player.seekTo).toHaveBeenLastCalledWith(10);
    expect(player.play).toHaveBeenCalled();
    expect([...timers.active.values()][0].ms).toBe(CONFIG.stage6.yt.pollMs);
    player.seekTo.mockClear();
    player.sec = 11.5;
    timers.tick();
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(root.textContent).toContain('0:11 / 3:45'); // 位置の表示も同じ確かめで進む
    player.sec = 12.05;
    timers.tick();
    expect(player.seekTo).toHaveBeenCalledWith(10);
    await click(root, '■ 止める');
    expect(player.pause).toHaveBeenCalled();
    expect(timers.active.size).toBe(0);
  });

  test('「▶ 再生」は位置から流し、くり返さない', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await mark(root, 10, 12);
    player.sec = 30;
    await click(root, '▶ 再生');
    expect(player.play).toHaveBeenCalled();
    player.seekTo.mockClear();
    player.sec = 31;
    timers.tick();
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(root.textContent).toContain('0:31 / 3:45');
  });

  test('YouTube の画面の中のボタンで再生しても、位置の表示が進む', async () => {
    addSong(song());
    const root = await open(makeDeps());
    expect(timers.active.size).toBe(0);
    playerOpts.onState('playing');
    player.sec = 65;
    timers.tick();
    expect(root.textContent).toContain('1:05 / 3:45');
  });

  test('くり返し中に動画が終わり（ended）、位置が長さの少し手前で止まっても、始まりへ戻して流す', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await mark(root, 200, 225);
    await click(root, '▶ 区間を くり返す');
    player.seekTo.mockClear();
    player.play.mockClear();
    player.sec = 224.96;
    timers.tick();
    expect(player.seekTo).not.toHaveBeenCalled(); // まだ終わりに届いていない
    playerOpts.onState('ended');
    expect(player.seekTo).toHaveBeenCalledWith(200);
    expect(player.play).toHaveBeenCalled();
    expect(timers.active.size).toBe(1); // くり返しは続く
  });

  test('くり返していないときは、ended・paused でタイマーを止め、playing でまた動かす', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await click(root, '▶ 再生');
    expect(timers.active.size).toBe(1);
    playerOpts.onState('ended');
    expect(timers.active.size).toBe(0);
    expect(player.seekTo).not.toHaveBeenCalled();
    playerOpts.onState('playing');
    expect(timers.active.size).toBe(1);
    playerOpts.onState('paused');
    expect(timers.active.size).toBe(0);
  });

  test('速さ 0.75 → setRate(0.75)。setRate が 0.5 を返したら 0.5 のボタンが選ばれる', async () => {
    addSong(song());
    const root = await open(makeDeps());
    expect(byLabel(root, '1倍').getAttribute('aria-pressed')).toBe('true');
    await click(root, '0.75倍');
    expect(player.setRate).toHaveBeenLastCalledWith(0.75);
    expect(byLabel(root, '0.75倍').getAttribute('aria-pressed')).toBe('true');
    player.rateResult = 0.5;
    await click(root, '0.75倍');
    expect(byLabel(root, '0.5倍').getAttribute('aria-pressed')).toBe('true');
    expect(byLabel(root, '0.75倍').getAttribute('aria-pressed')).toBe('false');
    expect(byLabel(root, '1倍').getAttribute('aria-pressed')).toBe('false');
  });

  test('区間を保存すると ytSections に入り、sections（曲ファイルの区間）は変わらない', async () => {
    addSong(song({ hasFile: true, durationSec: 225, sections: [FILE_SECTION] }));
    const root = await open(makeDeps());
    await mark(root, 10, 12);
    await click(root, '区間を 保存');
    expect(getSong('s1').ytSections).toHaveLength(1);
    expect(getSong('s1').sections).toEqual([FILE_SECTION]);
    expect(byLabel(root, '区間1')).toBeTruthy(); // 保存した区間のボタン
  });

  describe('区間を消す・上書きする（段6①と同じ決まり）', () => {
    const MAX_TEXT = '保存できる 区間は 5つ までです。いらない 区間を 消すと 保存できます';
    const YT1 = { id: 'y1', name: '区間1', startSec: 10, endSec: 12, lastLine: null, lastRatio: null };
    const five = () => [YT1, ...[2, 3, 4, 5].map((n) => ({ id: `y${n}`, name: `区間${n}`, startSec: n * 10, endSec: n * 10 + 2, lastLine: null, lastRatio: null }))];

    test('5つ保存してあると、保存しようとしたとき「消すと 保存できます」と案内する', async () => {
      addSong(song({ ytSections: five() }));
      const root = await open(makeDeps());
      await click(root, '始まりを 0.5秒 前へ');
      await click(root, '新しい 区間として 保存');
      expect(root.textContent).toContain(MAX_TEXT);
      expect(getSong('s1').ytSections).toHaveLength(5);
      expect(findBanned(root.textContent)).toEqual([]);
    });

    test('はじめは最初の保存区間が選ばれている。「区間を 消す」：confirm が false なら消えない', async () => {
      addSong(song({ ytSections: [YT1] }));
      const deps = makeDeps({ confirm: vi.fn(() => false) });
      const root = await open(deps);
      expect(root.textContent).toContain('区間：0:10.0 〜 0:12.0');
      await click(root, '区間を 消す');
      expect(deps.confirm).toHaveBeenCalledWith('この 区間を 消しますか？');
      expect(getSong('s1').ytSections).toHaveLength(1);
    });

    test('confirm が true なら1つ減り、選択がなくなる', async () => {
      addSong(song({ ytSections: five() }));
      const root = await open(makeDeps());
      await click(root, '区間を 消す');
      expect(getSong('s1').ytSections.map((c) => c.id)).toEqual(['y2', 'y3', 'y4', 'y5']);
      expect(byLabel(root, '区間1')).toBeUndefined();
      expect(byLabel(root, '区間を 消す')).toBeUndefined();
      expect(byLabel(root, '▶ 区間を くり返す')).toBeUndefined();
    });

    test('保存した区間の端を動かすと「まだ 保存して いません」と2つのボタン。「ここを 終わりに」でも同じ', async () => {
      addSong(song({ ytSections: [YT1] }));
      const root = await open(makeDeps());
      expect(byLabel(root, '上書きする')).toBeUndefined();
      player.sec = 13;
      await click(root, 'ここを 終わりに');
      expect(root.textContent).toContain('まだ 保存して いません');
      expect(byLabel(root, '上書きする')).toBeTruthy();
      expect(byLabel(root, '新しい 区間として 保存')).toBeTruthy();
    });

    test('「上書きする」：confirm が false なら変わらない、true なら同じ id で範囲が新しくなる', async () => {
      const kept = { ...YT1, lastLine: [{ t: 0, midi: 64 }] };
      addSong(song({ ytSections: [kept] }));
      const deps = makeDeps({ confirm: vi.fn(() => false) });
      const root = await open(deps);
      await click(root, '終わりを 0.5秒 後ろへ');
      await click(root, '上書きする');
      expect(deps.confirm).toHaveBeenCalledWith('前回の 線と 合いぐあいは 消えます。上書きしますか？');
      expect(getSong('s1').ytSections[0]).toMatchObject({ endSec: 12, lastLine: [{ t: 0, midi: 64 }] });
      deps.confirm.mockReturnValue(true);
      await click(root, '上書きする');
      expect(getSong('s1').ytSections).toEqual([{ ...YT1, endSec: 12.5, lastLine: null, lastRatio: null }]);
      expect(byLabel(root, '上書きする')).toBeUndefined();
    });
  });

  test('go("home") で destroy が1回、タイマーが止まる', async () => {
    addSong(song());
    const deps = makeDeps();
    const root = await open(deps);
    await mark(root, 10, 12);
    await click(root, '▶ 区間を くり返す');
    expect(timers.active.size).toBe(1);
    go('home');
    await settle();
    expect(root.textContent).toBe('ホーム');
    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(timers.active.size).toBe(0);
  });

  test('読み込み中に離れたあとで loadYouTubeApi が resolve しても何も作られない（待ちは中止される）', async () => {
    addSong(song());
    let resolveApi;
    const deps = makeDeps({ loadYouTubeApi: vi.fn(() => new Promise((r) => { resolveApi = r; })) });
    const root = await open(deps);
    const { signal } = deps.loadYouTubeApi.mock.calls[0][0];
    go('home');
    await settle();
    expect(signal.aborted).toBe(true);
    resolveApi({ Player: function FakePlayer() {} });
    await settle();
    expect(deps.createYtPlayer).not.toHaveBeenCalled();
    expect(root.textContent).toBe('ホーム');
  });

  test('プレーヤーを作っている途中に離れると中止され（AbortError）、何も出さない', async () => {
    addSong(song());
    const deps = makeDeps({
      createYtPlayer: vi.fn((container, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(named('AbortError')));
      })),
    });
    const root = await open(deps);
    go('home');
    await settle();
    expect(root.textContent).toBe('ホーム');
    expect(deps.loadYouTubeApi.mock.calls[0][0].signal.aborted).toBe(true);
    expect(deps.createYtPlayer.mock.calls[0][1].signal.aborted).toBe(true);
  });

  test('離れたあとに createYtPlayer が resolve したら、そのプレーヤーを1回 destroy し、タイマーも残らない', async () => {
    addSong(song());
    let resolvePlayer;
    const deps = makeDeps({ createYtPlayer: vi.fn(() => new Promise((r) => { resolvePlayer = r; })) });
    const root = await open(deps);
    go('home');
    await settle();
    resolvePlayer(player);
    await settle();
    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(timers.setInterval).not.toHaveBeenCalled();
    expect(timers.active.size).toBe(0);
    expect(root.textContent).toBe('ホーム');
  });

  test('YouTube の画面の文（yt…）に禁止の言葉が無い', () => {
    const texts = Object.entries(STAGE6_TEXT).filter(([k]) => k.startsWith('yt'))
      .map(([, v]) => (typeof v === 'function' ? v('0:10.0', '0:12.0') : v));
    expect(texts).toContain('YouTube で 練習');
    for (const t of texts) expect(findBanned(t)).toEqual([]);
  });

  describe('YouTube に合わせて歌う・結果', () => {
    const YT1 = { id: 'y1', name: '区間1', startSec: 10, endSec: 12, lastLine: null, lastRatio: null };

    beforeEach(() => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); // jsdom は絵を描けない
      graphLog.options.length = 0;
      graphLog.ghosts.length = 0;
      graphLog.rangeLines.length = 0;
    });

    // 「歌う」→「つけた」→ 前奏のあと、区間の始まりから終わりまで stepMs ごとに fn(i) の高さを流す。
    // 偽の時計：区間の始まりの位置を now=1000 で読ませ、そこから曲の位置 ms ぶん（速さで割った本当の時間）進める
    async function singTake(root, { from = 10, to = 12, rate = 1, stepMs = 20, fn = () => 55 } = {}) {
      await click(root, '● 歌う');
      await click(root, 'つけた');
      playerOpts.onState('playing');
      nowMs = 1000;
      player.sec = from;
      timers.tick();
      let i = 0;
      for (let ms = 0; ms <= (to - from) * 1000; ms += stepMs) {
        nowMs = 1000 + ms / rate;
        mic.emit(fn(i));
        i += 1;
      }
      nowMs = 1000 + ((to - from) * 1000 + 10) / rate;
      player.sec = to + 0.01;
      timers.tick();
      await settle();
    }

    test('「● 歌う」→ イヤホンの確認。「つけた」までマイクは開かない。歌い終わるとマイクを閉じ、pause する', async () => {
      addSong(song({ ytSections: [YT1] }));
      const root = await open(makeDeps());
      await click(root, '● 歌う');
      expect(root.textContent).toContain('イヤホンを つけましたか？');
      expect(openMic).not.toHaveBeenCalled();
      expect(root.querySelector('.yt-frame')).toBeTruthy(); // プレーヤーの枠は残す（描きなおすと動画が読みなおしになる）
      await click(root, 'つけた');
      expect(openMic).toHaveBeenCalledTimes(1);
      expect(player.seekTo).toHaveBeenLastCalledWith(10 - CONFIG.stage6.leadInSec);
      expect(player.play).toHaveBeenCalled();
      expect([...timers.active.values()][0].ms).toBe(CONFIG.stage6.yt.pollMs);
      expect(mic.close).not.toHaveBeenCalled();
      playerOpts.onState('playing');
      nowMs = 1000;
      player.sec = 10;
      timers.tick();
      for (let ms = 0; ms <= 2000; ms += 20) { nowMs = 1000 + ms; mic.emit(55); }
      nowMs = 3010;
      player.sec = 12.01;
      timers.tick();
      await settle();
      expect(player.pause).toHaveBeenCalled();
      expect(mic.close).toHaveBeenCalledTimes(1);
      expect(timers.active.size).toBe(0);
      expect(player.destroy).not.toHaveBeenCalled();
      expect(findBanned(root.textContent)).toEqual([]);
    });

    test('始まりが前奏より前なら 0 へ seekTo。「やめる」で戻るとマイクは開かない', async () => {
      addSong(song({ ytSections: [{ ...YT1, startSec: 1, endSec: 3 }] }));
      const root = await open(makeDeps());
      await click(root, '● 歌う');
      await click(root, 'やめる');
      expect(openMic).not.toHaveBeenCalled();
      expect(byLabel(root, '● 歌う')).toBeTruthy();
      await click(root, '● 歌う');
      await click(root, 'つけた');
      expect(player.seekTo).toHaveBeenLastCalledWith(0);
    });

    test('同じ高さを流す → 「まっすぐ」と、点数ではないという注意', async () => {
      addSong(song({ ytSections: [YT1] }));
      const root = await open(makeDeps());
      await singTake(root, { fn: () => 55 });
      expect(root.textContent).toContain('ゆれの 目安：まっすぐ');
      expect(root.textContent).toContain('声の 高さの ゆれ方の 目安で、うまい・へたの 点数ではありません');
      expect(findBanned(root.textContent)).toEqual([]);
    });

    test('±60 セントでゆれる → 「よく ゆれる」、±40 セント → 「ときどき ゆれる」', async () => {
      addSong(song({ ytSections: [YT1] }));
      const root = await open(makeDeps());
      await singTake(root, { fn: (i) => 55 + (i % 2 ? 0.6 : -0.6) });
      expect(root.textContent).toContain('ゆれの 目安：よく ゆれる');
      await click(root, 'もう一度 歌う');
      await click(root, 'つけた');
      expect(openMic).toHaveBeenCalledTimes(2); // 歌い終わるたびに閉じるので、開きなおす
      await click(root, '■ 止める');
      await singTake(root, { fn: (i) => 55 + (i % 2 ? 0.4 : -0.4) });
      expect(root.textContent).toContain('ゆれの 目安：ときどき ゆれる');
    });

    test('無音（null ばかり）→ 「声が 聞こえませんでした」。ゆれは出ず、履歴にも前回の線にも入らない', async () => {
      const kept = { ...YT1, lastLine: [{ t: 0, midi: 64 }] };
      addSong(song({ ytSections: [kept] }));
      const root = await open(makeDeps());
      await singTake(root, { fn: () => null });
      expect(root.textContent).toContain('声が 聞こえませんでした。もう一度 ためして みましょう');
      expect(root.textContent).not.toContain('ゆれの 目安');
      expect(getSong('s1').ytSections[0].lastLine).toEqual([{ t: 0, midi: 64 }]);
      await click(root, 'おわる');
      expect(root.textContent).toBe('曲の一覧');
      expect(loadState().history).toEqual([]);
    });

    test('声の地図 50〜60：65 を3コマ・45 を2コマ → 「上に 3回・下に 2回」と「無理に のばさない」。地図の線も引く', async () => {
      saveRange({ comfort: 55, low: 50, high: 60 });
      addSong(song({ ytSections: [YT1] }));
      const root = await open(makeDeps());
      // はじめの数コマはマイクの遅れのぶん前奏あつかいで捨てるので、20コマ目から外の音を出す
      const fn = (i) => ([20, 21, 22].includes(i) ? 65 : [40, 41].includes(i) ? 45 : 55);
      await singTake(root, { fn });
      expect(graphLog.rangeLines).toContainEqual([50, 60]);
      expect(root.textContent).toContain('声の 地図の 外：上に 3回・下に 2回');
      expect(root.textContent).toContain('高い 所は 無理に のばさないで ください');
      expect(findBanned(root.textContent)).toEqual([]);
    });

    test('声の地図が無いときは、地図の外の行も線も出ない', async () => {
      addSong(song({ ytSections: [YT1] }));
      const root = await open(makeDeps());
      await singTake(root, { fn: (i) => (i > 20 && i < 25 ? 80 : 55) });
      expect(root.textContent).not.toContain('声の 地図の 外');
      expect(graphLog.rangeLines.at(-1)).toEqual([null, null]);
    });

    test('地図の中だけなら、地図の外の行は出ない', async () => {
      saveRange({ comfort: 55, low: 50, high: 60 });
      addSong(song({ ytSections: [YT1] }));
      const root = await open(makeDeps());
      await singTake(root, { fn: () => 55 });
      expect(root.textContent).not.toContain('声の 地図の 外');
      expect(root.textContent).not.toContain('無理に のばさないで');
    });

    test('グラフの窓は max(6000, 区間の長さ + 前奏)', async () => {
      addSong(song({ ytSections: [YT1, { ...YT1, id: 'y2', name: '区間2', startSec: 20, endSec: 30 }] }));
      const root = await open(makeDeps());
      await click(root, '● 歌う');
      await click(root, 'つけた');
      expect(graphLog.options.at(-1).windowMs).toBe(6000);
      await click(root, '■ 止める');
      await click(root, '区間2');
      await click(root, '● 歌う');
      await click(root, 'つけた');
      expect(graphLog.options.at(-1).windowMs).toBe(10000 + CONFIG.stage6.leadInSec * 1000);
    });

    test('保存した区間で2回歌う → 2回目に前回の線が setGhost に渡る。lastLine が更新され lastRatio は null のまま', async () => {
      addSong(song({ ytSections: [YT1] }));
      const root = await open(makeDeps());
      await singTake(root, { fn: () => 55 });
      expect(graphLog.ghosts).toEqual([]); // 1回目は前回の線が無い
      const line = getSong('s1').ytSections[0].lastLine;
      expect(line.length).toBeGreaterThan(10);
      expect(line[0].midi).toBe(55);
      expect(line[0].t).toBeGreaterThanOrEqual(0); // 区間の始まりを 0 とした時刻（小数の誤差で 0 か 20）
      expect(line[0].t).toBeLessThanOrEqual(20);
      expect(getSong('s1').ytSections[0].lastRatio).toBeNull();
      await click(root, 'もう一度 歌う');
      await click(root, 'つけた');
      expect(graphLog.ghosts.at(-1)).toEqual(line);
      expect(root.textContent).not.toMatch(/\d+%/); // 前回との比べは線だけ（数字の点数は出さない）
    });

    test('保存していない区間で歌っても、区間は保存されない', async () => {
      addSong(song());
      const root = await open(makeDeps());
      await mark(root, 10, 12);
      await singTake(root, { fn: () => 55 });
      expect(root.textContent).toContain('ゆれの 目安：まっすぐ');
      expect(getSong('s1').ytSections).toEqual([]);
    });

    test('マイクの時刻：速さ 0.5 でも、区間の始まりを 0 とし、マイクの遅れ（latencyMs × 速さ）を引く', async () => {
      addSong(song({ ytSections: [YT1] }));
      const root = await open(makeDeps());
      await click(root, '0.5倍');
      await singTake(root, { rate: 0.5, stepMs: 25, fn: () => 55 });
      const lag = CONFIG.stage6.latencyMs * 0.5; // 60ms
      const line = getSong('s1').ytSections[0].lastLine;
      // 曲の位置 75ms のコマ → 75 − 60 = 15ms（それより前のコマは始まりより前なので捨てる）
      expect(line[0].t).toBe(75 - lag);
      expect(line[1].t).toBe(100 - lag);
      expect(line.at(-1).t).toBeLessThanOrEqual(2000);
    });

    test('歌い終えたら履歴に kind: yt・songTitle・tries: 1（「おわる」で1回だけ）', async () => {
      addSong(song({ ytSections: [YT1] }));
      const root = await open(makeDeps());
      await singTake(root, { fn: () => 55 });
      await click(root, 'おわる');
      expect(root.textContent).toBe('曲の一覧');
      const h = loadState().history;
      expect(h).toHaveLength(1);
      expect(h[0]).toMatchObject({ stage: 6, tries: 1, successes: 0, value: null, songTitle: '曲Y', kind: 'yt' });
      expect(h[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(player.destroy).toHaveBeenCalledTimes(1);
    });

    test('歌う途中で go("home") → 履歴に入らず、マイクが閉じ、destroy が呼ばれ、タイマーが止まる', async () => {
      addSong(song({ ytSections: [YT1] }));
      const root = await open(makeDeps());
      await singTake(root, { fn: () => null }); // 声なしの回は数えない
      await click(root, 'もう一度 歌う');
      await click(root, 'つけた');
      playerOpts.onState('playing');
      for (let i = 0; i < 30; i++) mic.emit(55);
      go('home');
      await settle();
      expect(root.textContent).toBe('ホーム');
      expect(loadState().history).toEqual([]);
      expect(mic.close).toHaveBeenCalled();
      expect(player.destroy).toHaveBeenCalledTimes(1);
      expect(timers.active.size).toBe(0);
    });

    test('「■ 止める」で途中でやめた回は数えない。動画が区間の終わりより先に ended になったら、そこで結果を出す', async () => {
      addSong(song({ ytSections: [YT1] }));
      const root = await open(makeDeps());
      await click(root, '● 歌う');
      await click(root, 'つけた');
      await click(root, '■ 止める');
      expect(player.pause).toHaveBeenCalled();
      expect(mic.close).toHaveBeenCalledTimes(1);
      expect(byLabel(root, '● 歌う')).toBeTruthy();
      await click(root, '● 歌う');
      await click(root, 'つけた');
      playerOpts.onState('playing');
      nowMs = 1000;
      player.sec = 10;
      timers.tick();
      for (let ms = 0; ms <= 1500; ms += 20) { nowMs = 1000 + ms; mic.emit(55); }
      playerOpts.onState('ended');
      await settle();
      expect(root.textContent).toContain('ゆれの 目安：まっすぐ');
      expect(timers.active.size).toBe(0);
      go('home');
      await settle();
      expect(loadState().history).toHaveLength(1);
    });

    test('歌う途中でアプリを隠してマイクが止まる → プレーヤーを止め、案内と「もう一度 歌う」。数えない', async () => {
      addSong(song({ ytSections: [YT1] }));
      const root = await open(makeDeps());
      await click(root, '● 歌う');
      await click(root, 'つけた');
      playerOpts.onState('playing');
      mic.hide();
      await settle();
      expect(player.pause).toHaveBeenCalled();
      expect(timers.active.size).toBe(0);
      expect(root.textContent).toContain('マイクが 止まりました。');
      await click(root, 'もう一度 歌う');
      await click(root, 'つけた');
      expect(openMic).toHaveBeenCalledTimes(2);
      go('home');
      await settle();
      expect(loadState().history).toEqual([]);
    });

    test('曲のファイルもある曲だけ「お手本の 線で 練習する」→ 曲の画面へ', async () => {
      addSong(song({ hasFile: true, durationSec: 225 }));
      const root = await open(makeDeps());
      let went = null;
      register('song', (r, params) => { went = params.get('id'); r.textContent = '曲の画面'; });
      await click(root, 'お手本の 線で 練習する');
      expect(went).toBe('s1');
      localStorage.clear();
      addSong(song());
      const root2 = await open(makeDeps());
      expect(byLabel(root2, 'お手本の 線で 練習する')).toBeUndefined();
    });

    test('新しい文に禁止の言葉が無い', () => {
      const texts = [STAGE6_TEXT.ytSteady, STAGE6_TEXT.ytSome, STAGE6_TEXT.ytWobbly, STAGE6_TEXT.ytWobbleNote,
        STAGE6_TEXT.ytNoVoice, STAGE6_TEXT.ytOutside(3, 2), STAGE6_TEXT.ytToSong];
      for (const t of texts) {
        expect(typeof t).toBe('string');
        expect(findBanned(t)).toEqual([]);
      }
    });
  });
});
