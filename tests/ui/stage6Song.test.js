import { describe, test, expect, beforeEach, vi } from 'vitest';

// 線グラフの作り方（窓の長さ）と push の時刻を記録する（中身は本物のまま）
const graphLog = vi.hoisted(() => ({ options: [], pushes: [] }));
vi.mock('../../src/ui/pitchGraph.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createPitchGraph: (canvas, options) => {
      graphLog.options.push(options);
      const g = actual.createPitchGraph(canvas, options);
      return { ...g, push: (now, midi) => { graphLog.pushes.push({ t: now, midi }); g.push(now, midi); } };
    },
  };
});
import { register, start, resetRoutes, go } from '../../src/router.js';
import { renderStage6Song } from '../../src/screens/stage6Song.js';
import { findBanned } from '../../src/logic/words.js';
import { loadState, addSong, saveRange, getSong } from '../../src/storage/store.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const byLabel = (root, label) => [...root.querySelectorAll('button')].find((b) => b.textContent === label);

// お手本の線：0〜2秒 ド4(60)、2〜4秒 声なし（間奏）、4〜6秒 ミ4(64)、6〜10秒 声なし。20ms ごと
const HOP = 20;
const LINE = {
  hopMs: HOP,
  fromVocal: true,
  midi: Array.from({ length: 500 }, (_, k) => {
    const t = k * HOP;
    if (t < 2000) return 60;
    if (t >= 4000 && t < 6000) return 64;
    return null;
  }),
};

const SING = { id: 'c1', name: '区間1', startSec: 4, endSec: 6, lastLine: null, lastRatio: null };
const INTERLUDE = { id: 'c2', name: '区間2', startSec: 2.2, endSec: 3.8, lastLine: null, lastRatio: null };
const song = (patch = {}) => ({
  id: 's1', title: '曲A', hasFile: true, hasVocal: true, durationSec: 10, keyAdvice: 0, sections: [SING, INTERLUDE], ...patch,
});

function makeMic() {
  let frame = null;
  return {
    onFrame: (cb) => { frame = cb; },
    onClosed: () => {},
    close: vi.fn(),
    emit: (midi) => frame?.(midi, 0),
  };
}

// 偽の曲のプレーヤー：play の終わりはテストが end() で決める。位置は sec で動かす
function makePlayer() {
  const p = {
    sec: 0,
    ends: [],
    play: vi.fn(() => new Promise((resolve) => { p.ends.push(resolve); })),
    stop: vi.fn(() => { p.ends.forEach((r) => r()); p.ends = []; }),
    currentSec: () => p.sec,
    onTime: vi.fn(),
    dispose: vi.fn(),
    end: () => { p.ends.forEach((r) => r()); p.ends = []; },
  };
  return p;
}

let mic;
let player;
let openMic;
function makeDeps(patch = {}) {
  mic = makeMic();
  player = makePlayer();
  openMic = vi.fn(async () => ({ ok: true, mic }));
  return {
    openMic,
    createSongPlayer: vi.fn(() => player),
    getFile: vi.fn(async (id, kind) => (kind === 'line' ? LINE : new Blob(['x']))),
    ...patch,
  };
}

async function open(deps, id = 's1') {
  resetRoutes();
  history.replaceState(null, '', location.pathname);
  register('song', (root, params) => renderStage6Song(root, params, deps));
  register('stage6', (root) => { root.textContent = '曲の一覧'; });
  register('home', (root) => { root.textContent = 'ホーム'; });
  const root = document.createElement('div');
  location.hash = `#song?id=${id}`;
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

// 「歌う」→「つけた」→ 区間の始まりから終わりまで、fn(曲の秒) の高さを 20ms ごとに流して終える
async function singSection(root, section, fn) {
  await click(root, '● 歌う');
  await click(root, 'つけた');
  for (let ms = 0; ms <= (section.endSec - section.startSec) * 1000; ms += HOP) {
    player.sec = section.startSec + ms / 1000;
    mic.emit(fn(player.sec));
  }
  player.end();
  await settle();
}

describe('段6 曲で練習する画面', () => {
  beforeEach(() => {
    localStorage.clear();
    saveRange({ comfort: 55, low: 50, high: 67 });
    graphLog.options = [];
    graphLog.pushes = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  test('曲名と、キーの案内（keyAdvice > 0 のとき）が出る', async () => {
    addSong(song({ keyAdvice: 2 }));
    const root = await open(makeDeps());
    expect(root.textContent).toContain('曲A');
    expect(root.textContent).toContain('この 曲は、キーを 2つ 下げると 楽に なりそう です（目安）。カラオケでは キーを 下げて みましょう');
    expect(findBanned(root.textContent)).toEqual([]);
  });

  test('ファイルや線が無い曲は、選びなおしの案内と一覧へのボタン', async () => {
    addSong(song());
    const root = await open(makeDeps({ getFile: vi.fn(async () => null) }));
    expect(root.textContent).toContain('ファイルを もう一度 選んで ください');
    await click(root, '曲の 一覧へ');
    expect(root.textContent).toBe('曲の一覧');
  });

  test('知らない曲の id でも止まらない', async () => {
    const root = await open(makeDeps(), 'nothing');
    expect(root.textContent).toContain('ファイルを もう一度 選んで ください');
  });

  test('「聞く」は区間をくり返し、speaker:true で流す。速さと聞く音を選べる', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await click(root, '0.75倍');
    await click(root, '歌声だけ');
    await click(root, '▶ 聞く');
    expect(player.play).toHaveBeenLastCalledWith({ fromSec: 4, toSec: 6, rate: 0.75, source: 'vocal', loop: true, speaker: true });
    player.stop.mockClear();
    await click(root, '■ 止める');
    expect(player.stop).toHaveBeenCalled();
  });

  test('聞く音は、あるファイルの方だけ選べる', async () => {
    addSong(song({ hasVocal: false }));
    const root = await open(makeDeps());
    expect(byLabel(root, '原曲')).toBeTruthy();
    expect(byLabel(root, '歌声だけ')).toBeUndefined();
  });

  test('「歌う」→ イヤホンの確認が出て、「つけた」までマイクは開かない', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await click(root, '● 歌う');
    expect(root.textContent).toContain('イヤホンを つけましたか？');
    expect(openMic).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    await click(root, 'つけた');
    expect(openMic).toHaveBeenCalledTimes(1);
    // 区間の leadInSec(2秒) 前から1回だけ、スピーカーは借りずに流す
    expect(player.play).toHaveBeenLastCalledWith({ fromSec: 2, toSec: 6, rate: 1, source: 'file', loop: false, speaker: false });
  });

  test('2回目の「歌う」でも、毎回イヤホンの確認が出る', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await singSection(root, SING, () => 64);
    await click(root, 'もう一度 歌う');
    expect(root.textContent).toContain('イヤホンを つけましたか？');
  });

  test('お手本どおりに歌う → 合いぐあい 100% 前後（目安）と、音ごとの結果', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await singSection(root, SING, () => 64);
    const m = root.textContent.match(/いまの 合いぐあい：(\d+)%（目安）/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(90);
    expect(root.textContent).toContain('合って いた');
    expect(findBanned(root.textContent)).toEqual([]);
  });

  test('高めに歌うと「高め」。区間の始まりより前（前奏）の声は数えない', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await click(root, '● 歌う');
    await click(root, 'つけた');
    player.sec = 3; // 区間の前：数えない
    mic.emit(50);
    for (let ms = 0; ms <= 2000; ms += HOP) {
      player.sec = 4 + ms / 1000;
      mic.emit(65.5);
    }
    player.end();
    await settle();
    expect(root.textContent).toContain('高め');
    expect(root.textContent).toMatch(/いまの 合いぐあい：0%（目安）/);
  });

  test('間奏だけの区間 → 0% ではなく「お手本の 声が ありません」', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await click(root, '区間2');
    await singSection(root, INTERLUDE, () => 60);
    expect(root.textContent).toContain('この 区間には お手本の 声が ありません');
    expect(root.textContent).not.toContain('0%');
  });

  test('声の地図より高い音があると「無理に のばさないで」', async () => {
    saveRange({ comfort: 55, low: 50, high: 62 });
    addSong(song());
    const root = await open(makeDeps());
    await singSection(root, SING, () => 64);
    expect(root.textContent).toContain('高い 所は 無理に のばさないで ください');
  });

  test('保存した区間で2回歌う → 2回目に「前回：」、線と合いぐあいが区間に残る', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await singSection(root, SING, () => 64);
    expect(root.textContent).not.toContain('前回：');
    const saved = getSong('s1').sections.find((c) => c.id === 'c1');
    expect(saved.lastRatio).toBeGreaterThan(0.9);
    expect(saved.lastLine.length).toBeGreaterThan(10);
    await click(root, 'もう一度 歌う');
    await click(root, 'つけた');
    expect(openMic).toHaveBeenCalledTimes(1); // 開いたままのマイクを使う
    for (let ms = 0; ms <= 2000; ms += HOP) {
      player.sec = 4 + ms / 1000;
      mic.emit(64);
    }
    player.end();
    await settle();
    expect(root.textContent).toMatch(/前回：\d+%/);
  });

  test('なぞって選んだ区間を保存すると「区間3」ができる。上限なら案内', async () => {
    addSong(song());
    const root = await open(makeDeps());
    const canvas = root.querySelector('canvas.song-overview');
    const ptr = (type, x) => {
      const e = new Event(type);
      e.clientX = x;
      canvas.dispatchEvent(e);
    };
    // 幅 300px・10秒 → 30px が1秒
    ptr('pointerdown', 30);
    ptr('pointerup', 90);
    await click(root, '区間を 保存');
    expect(getSong('s1').sections.map((c) => c.name)).toEqual(['区間1', '区間2', '区間3']);
    expect(getSong('s1').sections[2]).toMatchObject({ startSec: 1, endSec: 3 });
    expect(byLabel(root, '区間3')).toBeTruthy();
    for (const x of [100, 150, 200]) {
      ptr('pointerdown', x);
      ptr('pointerup', x + 30);
      await click(root, '区間を 保存');
    }
    expect(getSong('s1').sections).toHaveLength(5);
    expect(root.textContent).toContain('保存できる 区間は 5つ までです');
  });

  test('区間が無いときは「聞く」「歌う」で区間を選ぶよう案内する', async () => {
    addSong(song({ sections: [] }));
    const root = await open(makeDeps());
    await click(root, '● 歌う');
    expect(root.textContent).not.toContain('イヤホンを つけましたか？');
    expect(root.textContent).toContain('線を なぞって 区間を 選んで ください');
    await click(root, '▶ 聞く');
    expect(player.play).not.toHaveBeenCalled();
  });

  test('画面を離れる → 再生の後始末・マイクを閉じる・きろくに段6', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await singSection(root, SING, () => 64);
    player.stop.mockClear();
    go('home');
    await settle();
    expect(player.stop).toHaveBeenCalled();
    expect(player.dispose).toHaveBeenCalled();
    expect(mic.close).toHaveBeenCalled();
    const h = loadState().history;
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ stage: 6, tries: 1, successes: 1, songTitle: '曲A' });
    expect(h[0].value).toBeGreaterThan(0.9);
    expect(root.textContent).toBe('ホーム');
  });

  test('「おわる」で一覧へ戻り、きろくは1回だけ', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await singSection(root, SING, () => 64);
    await click(root, 'もどる');
    await click(root, 'おわる');
    expect(root.textContent).toBe('曲の一覧');
    expect(loadState().history).toHaveLength(1);
  });

  test('歌わずに離れたら、きろくは残さない', async () => {
    addSong(song());
    await open(makeDeps());
    go('home');
    await settle();
    expect(loadState().history).toHaveLength(0);
    expect(player.dispose).toHaveBeenCalled();
  });

  test('歌っている途中で離れても、結果は出さず、きろくも残さない', async () => {
    addSong(song());
    const root = await open(makeDeps());
    await click(root, '● 歌う');
    await click(root, 'つけた');
    player.sec = 4.5;
    mic.emit(64);
    player.stop.mockClear();
    go('home');
    await settle();
    expect(player.stop).toHaveBeenCalled();
    expect(mic.close).toHaveBeenCalled();
    expect(loadState().history).toHaveLength(0);
    expect(root.textContent).toBe('ホーム');
  });

  test('長い区間（12秒）でも、歌い終わると区間の始まりからの線が窓に入っている', async () => {
    const long = { id: 'c3', name: '区間3', startSec: 0, endSec: 12, lastLine: [{ t: 0, midi: 60 }], lastRatio: 0.5 };
    addSong(song({ durationSec: 12, sections: [long] }));
    const root = await open(makeDeps());
    await singSection(root, long, () => 60);
    const { windowMs } = graphLog.options.at(-1);
    expect(windowMs).toBeGreaterThanOrEqual(12000);
    const last = graphLog.pushes.at(-1).t;
    expect(last).toBe(12000);
    const firstVoiced = graphLog.pushes.find((p) => p.midi !== null).t;
    expect(firstVoiced).toBe(0);
    expect(firstVoiced).toBeGreaterThanOrEqual(last - windowMs); // 捨てられずに見えている
    expect(root.textContent).toMatch(/前回：50%/);
  });

  test('短い区間は、ふつうの窓（6秒）のまま', async () => {
    const short = { id: 'c4', name: '区間4', startSec: 4, endSec: 5, lastLine: null, lastRatio: null };
    addSong(song({ sections: [short] }));
    const root = await open(makeDeps());
    await singSection(root, short, () => 64);
    expect(graphLog.options.at(-1).windowMs).toBe(6000);
  });

  test('お手本の声が無い区間で歌っても、前回の線と合いぐあいは書きかえない', async () => {
    const before = { ...INTERLUDE, lastLine: [{ t: 0, midi: 60 }], lastRatio: 0.4 };
    addSong(song({ sections: [before] }));
    const root = await open(makeDeps());
    await singSection(root, before, () => 60);
    expect(root.textContent).toContain('お手本の 声が ありません');
    expect(getSong('s1').sections[0]).toMatchObject({ lastLine: [{ t: 0, midi: 60 }], lastRatio: 0.4 });
  });

  test('「聞く」で再生が拒まれたら「曲を 流せませんでした」', async () => {
    addSong(song());
    const deps = makeDeps();
    player.play.mockImplementation(() => Promise.reject(new Error('拒否')));
    const root = await open(deps);
    await click(root, '▶ 聞く');
    expect(root.textContent).toContain('曲を 流せませんでした');
  });

  test('「歌う」で再生が拒まれたら、もとの画面に戻って「曲を 流せませんでした」', async () => {
    addSong(song());
    const deps = makeDeps();
    player.play.mockImplementation(() => Promise.reject(new Error('拒否')));
    const root = await open(deps);
    await click(root, '● 歌う');
    await click(root, 'つけた');
    expect(root.textContent).toContain('曲を 流せませんでした');
    expect(byLabel(root, '● 歌う')).toBeTruthy();
    expect(loadState().history).toHaveLength(0);
  });
});
