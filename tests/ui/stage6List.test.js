import { describe, test, expect, beforeEach, vi } from 'vitest';
import { register, start, resetRoutes, go } from '../../src/router.js';
import { renderStage6List } from '../../src/screens/stage6List.js';
import { findBanned } from '../../src/logic/words.js';
import { loadState, addSong } from '../../src/storage/store.js';

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
    confirm: vi.fn(() => true),
    ...patch,
  };
}

async function open(deps) {
  resetRoutes();
  history.replaceState(null, '', location.pathname);
  register('stage6', (root, params) => renderStage6List(root, params, deps));
  register('song', (root) => { root.textContent = '曲の画面'; });
  register('vocalGuide', (root) => { root.textContent = '作り方'; });
  register('home', (root) => { root.textContent = 'ホーム'; });
  const root = document.createElement('div');
  location.hash = '#stage6';
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
});
