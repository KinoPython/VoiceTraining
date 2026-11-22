import { describe, test, expect, beforeEach, vi } from 'vitest';
import { register, start, resetRoutes, go } from '../../src/router.js';
import { renderStage6List } from '../../src/screens/stage6List.js';
import { findBanned } from '../../src/logic/words.js';
import { loadState, addSong, getSong } from '../../src/storage/store.js';
import { READ_FAILED } from '../../src/storage/songFiles.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const byLabel = (root, label) => [...root.querySelectorAll('button')].find((b) => b.textContent === label);

// 偽の「読み込んだ音」：長さだけ変えられる
const fakeBuffer = (duration) => ({
  duration, sampleRate: 8000, numberOfChannels: 1, length: 4,
  getChannelData: () => new Float32Array(4),
});
const fakeLine = { hopMs: 20, midi: [60, 60, 60, 60, 60, 60, 60, 60, 60, 60] };

function makeDeps(patch = {}) {
  return {
    decode: vi.fn(async () => fakeBuffer(100)),
    extractLine: vi.fn(async () => fakeLine),
    putFile: vi.fn(async () => ({ ok: true })),
    removeSongFiles: vi.fn(async () => {}),
    getFile: vi.fn(async () => new Blob(['x'])),
    listSongIds: vi.fn(async () => []),
    requestPersist: vi.fn(),
    confirm: vi.fn(() => true),
    ...patch,
  };
}

async function open(deps, hash = '#stage6') {
  resetRoutes();
  history.replaceState(null, '', location.pathname);
  register('stage6', (root, params) => renderStage6List(root, params, deps));
  register('song', (root) => { root.textContent = '曲の画面'; });
  register('vocalGuide', (root) => { root.textContent = '作り方'; });
  register('home', (root) => { root.textContent = 'ホーム'; });
  const root = document.createElement('div');
  location.hash = hash;
  await start(root);
  await settle();
  return root;
}

// 隠れた入力に、選んだファイルを入れる
function pick(root, kind, name = 'a.m4a') {
  const input = root.querySelector(`input[data-kind="${kind}"]`);
  Object.defineProperty(input, 'files', { value: [new File(['x'], name)], configurable: true });
  input.dispatchEvent(new Event('change'));
}

async function fillAndSubmit(root, kinds, title = 'テスト曲') {
  byLabel(root, '＋ 曲を 足す').click();
  const t = root.querySelector('input[type="text"]');
  t.value = title;
  t.dispatchEvent(new Event('input'));
  for (const k of kinds) pick(root, k);
  byLabel(root, '追加する').click();
  await settle();
}

const song = (patch = {}) => ({ id: 's1', title: '曲A', hasFile: true, hasVocal: false, durationSec: 100, sections: [], keyAdvice: 0, ...patch });

describe('段6 曲の一覧と追加', () => {
  beforeEach(() => localStorage.clear());

  test('入口の注意と、曲の一覧（印つき）が出る', async () => {
    addSong(song());
    addSong(song({ id: 's2', title: '曲B', hasFile: false, hasVocal: true }));
    const root = await open(makeDeps());
    expect(root.textContent).toContain('イヤホンが 必要です');
    expect(root.textContent).toContain('高い 所を 無理に くり返さない');
    expect(root.textContent).toContain('🎵');
    expect(root.textContent).toContain('🎤');
    byLabel(root, '曲A').click();
    await settle();
    expect(location.hash).toBe('#song?id=s1');
  });

  test('「歌声だけの ファイルの 作り方」から vocalGuide へ', async () => {
    const root = await open(makeDeps());
    byLabel(root, '＋ 曲を 足す').click();
    byLabel(root, '歌声だけの ファイルの 作り方 ›').click();
    await settle();
    expect(location.hash).toBe('#vocalGuide');
  });

  test('曲を足す画面に、使ってよい曲と「スマホの外に出さない」の一言が出る', async () => {
    const root = await open(makeDeps());
    byLabel(root, '＋ 曲を 足す').click();
    expect(root.textContent).toContain('自分で 買った 曲や、自分の CD から 取り込んだ 曲を 使って ください。ファイルと お手本の 線は この スマホの 中だけで 使い、外には 送りません。');
  });

  test('入口の注意に、音量と休む目安が出る', async () => {
    const root = await open(makeDeps());
    expect(root.textContent).toContain('音量は 小さめに して、自分の 声も 聞こえる くらいに しましょう');
    expect(root.textContent).toContain('何回か 歌ったら、ひと休み しましょう');
  });

  test('読めないファイルは「読めません」と出て、曲は増えない', async () => {
    const deps = makeDeps({ decode: vi.fn(async () => { throw new Error('bad'); }) });
    const root = await open(deps);
    await fillAndSubmit(root, ['file']);
    expect(root.textContent).toContain('この ファイルは 読めません');
    expect(loadState().songs).toEqual([]);
    expect(deps.putFile).not.toHaveBeenCalled();
  });

  test('曲ファイルだけ：「伴奏が まざって いる」が出て、file と line を保存する', async () => {
    const deps = makeDeps();
    const root = await open(deps);
    await fillAndSubmit(root, ['file']);
    expect(root.textContent).toContain('伴奏が まざって いるので');
    const kinds = deps.putFile.mock.calls.map((c) => c[1]);
    expect(kinds).toEqual(['file', 'line']);
    const saved = deps.putFile.mock.calls[1][2];
    expect(saved).toEqual({ hopMs: 20, midi: fakeLine.midi, fromVocal: false });
    const [s] = loadState().songs;
    expect(s).toMatchObject({ title: 'テスト曲', hasFile: true, hasVocal: false, durationSec: 100 });
    byLabel(root, '曲の 画面へ').click();
    await settle();
    expect(location.hash).toBe(`#song?id=${s.id}`);
  });

  test('歌声だけがあれば、それから線を作り、伴奏の注意は出ない', async () => {
    const deps = makeDeps();
    const root = await open(deps);
    await fillAndSubmit(root, ['vocal']);
    expect(root.textContent).not.toContain('伴奏が まざって');
    expect(deps.putFile.mock.calls.map((c) => c[1])).toEqual(['vocal', 'line']);
    expect(deps.putFile.mock.calls[1][2].fromVocal).toBe(true);
    expect(location.hash).toMatch(/^#song\?id=/); // 注意が無ければそのまま曲の画面へ
  });

  test('長さが2秒ちがう2つ：「同じ 曲か 確かめて」。追加は止めない', async () => {
    const lengths = [100, 102];
    const deps = makeDeps({ decode: vi.fn(async () => fakeBuffer(lengths.shift())) });
    const root = await open(deps);
    await fillAndSubmit(root, ['file', 'vocal']);
    expect(root.textContent).toContain('同じ 曲か 確かめて ください');
    expect(loadState().songs).toHaveLength(1);
    expect(loadState().songs[0].durationSec).toBe(100); // 曲ファイルの長さを使う
  });

  test('容量不足：「保存できませんでした」。曲は増えず、保存分は消す', async () => {
    const deps = makeDeps({ putFile: vi.fn(async () => ({ ok: false, reason: 'quota' })) });
    const root = await open(deps);
    await fillAndSubmit(root, ['file']);
    expect(root.textContent).toContain('保存できませんでした。ほかの 曲を 消すと 入る ことが あります');
    expect(loadState().songs).toEqual([]);
    expect(deps.removeSongFiles).toHaveBeenCalledTimes(1);
  });

  test('作っている途中で画面を離れると、signal が止まる', async () => {
    let seen = null;
    const deps = makeDeps({
      extractLine: vi.fn((s, r, opts) => { seen = opts.signal; return new Promise(() => {}); }),
    });
    const root = await open(deps);
    await fillAndSubmit(root, ['file']);
    expect(seen.aborted).toBe(false);
    go('home');
    await settle();
    expect(seen.aborted).toBe(true);
    expect(loadState().songs).toEqual([]);
  });

  test('進み具合が出る', async () => {
    const deps = makeDeps({
      extractLine: vi.fn((s, r, opts) => { opts.onProgress(0.42); return new Promise(() => {}); }),
    });
    const root = await open(deps);
    await fillAndSubmit(root, ['file']);
    expect(root.textContent).toContain('お手本の 線を 作って います… 42%');
  });

  test('曲名なし・ファイルなしでは追加しない', async () => {
    const deps = makeDeps();
    const root = await open(deps);
    byLabel(root, '＋ 曲を 足す').click();
    byLabel(root, '追加する').click();
    await settle();
    expect(root.textContent).toContain('曲名を 入れて ください');
    expect(deps.decode).not.toHaveBeenCalled();
  });

  test('消す：確認して OK なら曲とファイルを消す。キャンセルなら残す', async () => {
    addSong(song());
    const deps = makeDeps({ confirm: vi.fn(() => false) });
    const root = await open(deps);
    byLabel(root, '消す').click();
    await settle();
    expect(loadState().songs).toHaveLength(1);
    deps.confirm.mockReturnValue(true);
    byLabel(root, '消す').click();
    await settle();
    expect(loadState().songs).toEqual([]);
    expect(deps.removeSongFiles).toHaveBeenCalledWith('s1');
  });

  test('ファイルが無い曲（バックアップから戻した）も一覧に出て、選びなおしの印が付く', async () => {
    addSong(song());
    const deps = makeDeps({ getFile: vi.fn(async () => null) });
    const root = await open(deps);
    expect(root.textContent).toContain('曲A');
    expect(root.textContent).toContain('ファイルを もう一度 選んで ください');
  });

  test('ファイルがある曲には選びなおしの印は付かない', async () => {
    addSong(song());
    const root = await open(makeDeps());
    expect(root.textContent).not.toContain('もう一度 選んで');
  });

  test('画面の文に禁止の言葉がない', async () => {
    addSong(song());
    const root = await open(makeDeps());
    byLabel(root, '＋ 曲を 足す').click();
    expect(findBanned(root.textContent)).toEqual([]);
  });

  test('読み出しに失敗しただけ（ファイルはあるかもしれない）のときは、選びなおしの印を出さない', async () => {
    addSong(song());
    const root = await open(makeDeps({ getFile: vi.fn(async () => READ_FAILED) }));
    expect(root.textContent).toContain('曲A');
    expect(root.textContent).not.toContain('もう一度 選んで');
  });
});

describe('段6 ファイルを選びなおす', () => {
  beforeEach(() => localStorage.clear());

  const kept = { id: 'c1', name: '区間1', startSec: 1, endSec: 3, lastLine: [{ t: 0, midi: 60 }], lastRatio: 0.5 };

  async function refile(root, kinds) {
    for (const k of kinds) pick(root, k);
    byLabel(root, '読みこむ').click();
    await settle();
  }

  test('一覧の曲ごとに「ファイルを 選びなおす」。選ぶと保存しなおし、区間と前回の線は残る', async () => {
    localStorage.setItem('koetore.v1', JSON.stringify({ version: 1, range: { comfort: 55, low: 50, high: 58 } }));
    addSong(song({ hasFile: true, sections: [kept] }));
    const deps = makeDeps({ getFile: vi.fn(async () => null), decode: vi.fn(async () => fakeBuffer(120)) });
    const root = await open(deps);
    byLabel(root, 'ファイルを 選びなおす').click();
    expect(root.textContent).toContain('保存した 区間と 前回の 自分の 線は そのまま 残ります');
    await refile(root, ['file']);
    expect(deps.putFile.mock.calls.map((c) => [c[0], c[1]])).toEqual([['s1', 'file'], ['s1', 'line']]);
    expect(deps.removeSongFiles).not.toHaveBeenCalled();
    const s = getSong('s1');
    expect(s).toMatchObject({ title: '曲A', hasFile: true, hasVocal: false, durationSec: 120, keyAdvice: 2 });
    expect(s.sections).toEqual([kept]);
    expect(loadState().songs).toHaveLength(1);
    byLabel(root, '曲の 画面へ').click(); // 伴奏まざりの知らせのあと
    await settle();
    expect(location.hash).toBe('#song?id=s1');
  });

  test('#stage6?refile=曲の id で開くと、その曲の選びなおしの画面が出る', async () => {
    addSong(song());
    const root = await open(makeDeps(), '#stage6?refile=s1');
    expect(byLabel(root, '読みこむ')).toBeTruthy();
    expect(root.textContent).toContain('曲A');
  });

  test('ファイルを選ばずに「読みこむ」は案内だけ。やめると一覧へ', async () => {
    addSong(song());
    const deps = makeDeps();
    const root = await open(deps, '#stage6?refile=s1');
    byLabel(root, '読みこむ').click();
    await settle();
    expect(root.textContent).toContain('ファイルを 1つ 以上 選んで ください');
    expect(deps.decode).not.toHaveBeenCalled();
    byLabel(root, 'やめる').click();
    expect(byLabel(root, '＋ 曲を 足す')).toBeTruthy();
  });

  test('曲ファイルだけ選びなおしても、スマホに歌声だけのファイルがあれば、線はそちらから作る', async () => {
    addSong(song({ hasFile: true, hasVocal: true }));
    const vocalBlob = new Blob(['v']);
    const deps = makeDeps({ getFile: vi.fn(async (id, kind) => (kind === 'vocal' ? vocalBlob : null)) });
    const root = await open(deps, '#stage6?refile=s1');
    await refile(root, ['file']);
    expect(deps.decode.mock.calls.map((c) => c[0])).toContain(vocalBlob);
    expect(deps.putFile.mock.calls.map((c) => c[1])).toEqual(['file', 'line']); // 歌声だけは保存しなおさない
    expect(deps.putFile.mock.calls[1][2].fromVocal).toBe(true);
    expect(getSong('s1')).toMatchObject({ hasFile: true, hasVocal: true });
    expect(location.hash).toBe('#song?id=s1'); // 知らせが無いのでそのまま曲の画面へ
  });

  test('スマホに無いほうの印は外す（歌声だけを選びなおし、曲ファイルは無い）', async () => {
    addSong(song({ hasFile: true, hasVocal: false }));
    const deps = makeDeps({ getFile: vi.fn(async () => null) });
    const root = await open(deps, '#stage6?refile=s1');
    await refile(root, ['vocal']);
    expect(getSong('s1')).toMatchObject({ hasFile: false, hasVocal: true });
  });

  test('読めないファイルを選んだら「読めません」。曲の記録はそのまま', async () => {
    addSong(song({ sections: [kept] }));
    const deps = makeDeps({ decode: vi.fn(async () => { throw new Error('bad'); }) });
    const root = await open(deps, '#stage6?refile=s1');
    await refile(root, ['file']);
    expect(root.textContent).toContain('この ファイルは 読めません');
    expect(getSong('s1')).toEqual(song({ sections: [kept] }));
    expect(deps.putFile).not.toHaveBeenCalled();
  });
});

describe('段6 保存の失敗・置き去りのファイル・メモリ', () => {
  beforeEach(() => localStorage.clear());

  test('曲の記録（localStorage）が書けないと「保存できませんでした」。入れたファイルは消す', async () => {
    const deps = makeDeps();
    const root = await open(deps);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await fillAndSubmit(root, ['file']);
    spy.mockRestore();
    expect(root.textContent).toContain('保存できませんでした。ほかの 曲を 消すと 入る ことが あります');
    const id = deps.putFile.mock.calls[0][0];
    expect(deps.removeSongFiles).toHaveBeenCalledWith(id);
    expect(loadState().songs).toEqual([]);
    expect(deps.requestPersist).not.toHaveBeenCalled();
  });

  test('曲を足せたら、記録を消さないようブラウザにお願いする（requestPersist）', async () => {
    const deps = makeDeps();
    const root = await open(deps);
    await fillAndSubmit(root, ['vocal']);
    expect(deps.requestPersist).toHaveBeenCalledTimes(1);
  });

  test('一覧を開くと、記録に無い曲のファイル（置き去り）を消す', async () => {
    addSong(song());
    const deps = makeDeps({ listSongIds: vi.fn(async () => ['s1', 'orphan']) });
    await open(deps);
    expect(deps.removeSongFiles).toHaveBeenCalledWith('orphan');
    expect(deps.removeSongFiles).not.toHaveBeenCalledWith('s1'); // 記録にある曲は消さない
  });

  test('置き場の一覧が読めない・記録が読めないときは、何も消さない', async () => {
    addSong(song());
    const deps = makeDeps({ listSongIds: vi.fn(async () => null) });
    await open(deps);
    expect(deps.removeSongFiles).not.toHaveBeenCalled();
    localStorage.setItem('koetore.v1', '{こわれた');
    const deps2 = makeDeps({ listSongIds: vi.fn(async () => ['s1']) });
    await open(deps2);
    expect(deps2.removeSongFiles).not.toHaveBeenCalled();
  });

  test('2つとも選んだら、1つずつ読み、線に使わない曲ファイルの音のデータは読まずに手放す', async () => {
    const order = [];
    const fileBuf = { ...fakeBuffer(100), getChannelData: vi.fn(() => new Float32Array(4)) };
    const vocalBuf = { ...fakeBuffer(100), getChannelData: vi.fn(() => new Float32Array(4)) };
    let releaseFirst;
    const deps = makeDeps({
      decode: vi.fn((blob) => {
        order.push(blob.name);
        if (order.length === 1) return new Promise((r) => { releaseFirst = () => r(fileBuf); });
        return Promise.resolve(vocalBuf);
      }),
    });
    const root = await open(deps);
    byLabel(root, '＋ 曲を 足す').click();
    const t = root.querySelector('input[type="text"]');
    t.value = '曲';
    t.dispatchEvent(new Event('input'));
    pick(root, 'file', 'song.m4a');
    pick(root, 'vocal', 'vocal.m4a');
    byLabel(root, '追加する').click();
    await settle();
    expect(deps.decode).toHaveBeenCalledTimes(1); // 1つ目が終わるまで2つ目は読まない
    releaseFirst();
    await settle();
    expect(order).toEqual(['song.m4a', 'vocal.m4a']);
    expect(fileBuf.getChannelData).not.toHaveBeenCalled();
    expect(vocalBuf.getChannelData).toHaveBeenCalled();
    expect(deps.extractLine).toHaveBeenCalledTimes(1);
  });

  test('線を作っている間、線に使わない曲ファイルの音のデータは持ち続けない（6分の曲2つでメモリが足りなくならないように）', async () => {
    expect(typeof globalThis.gc).toBe('function'); // vitest.config.js の --expose-gc
    let fileRef = null;
    let fileAlive = null;
    const deps = makeDeps({
      // vi.fn は返した値を覚えてしまうので、ふつうの関数にする
      decode: async (blob) => {
        const buf = fakeBuffer(100);
        if (blob.name === 'song.m4a') fileRef = new WeakRef(buf);
        return buf;
      },
      extractLine: async () => {
        await new Promise((r) => setTimeout(r, 0));
        globalThis.gc();
        fileAlive = fileRef.deref() !== undefined;
        return fakeLine;
      },
    });
    const root = await open(deps);
    byLabel(root, '＋ 曲を 足す').click();
    const t = root.querySelector('input[type="text"]');
    t.value = '曲';
    t.dispatchEvent(new Event('input'));
    pick(root, 'file', 'song.m4a');
    pick(root, 'vocal', 'vocal.m4a');
    byLabel(root, '追加する').click();
    await settle();
    expect(fileAlive).toBe(false);
    expect(loadState().songs[0].durationSec).toBe(100);
  });
});
