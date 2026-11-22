import { Blob as NodeBlob } from 'node:buffer';
import { describe, test, expect, vi, afterEach } from 'vitest';
import { putFile, getFile, removeSongFiles, isReadFailure, listSongIds } from '../../src/storage/songFiles.js';

afterEach(() => vi.restoreAllMocks());

describe('曲のファイルの置き場', () => {
  test('Blob を入れて出すと同じ大きさ、線のオブジェクトは同じ中身', async () => {
    // jsdom の Blob は Node の複製では中身が消えるため、Node 本来の Blob を使う（ブラウザでは問題ない）
    const blob = new NodeBlob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'audio/mpeg' });
    const line = { hopMs: 20, midi: [60, null, 62] };
    expect(await putFile('a', 'file', blob)).toEqual({ ok: true });
    expect(await putFile('a', 'line', line)).toEqual({ ok: true });
    const got = await getFile('a', 'file');
    expect(got.size).toBe(5);
    expect(await getFile('a', 'line')).toEqual(line);
  });

  test('removeSongFiles で 3 つとも null。ほかの曲は残る', async () => {
    for (const k of ['file', 'vocal', 'line']) await putFile('b', k, { k });
    await putFile('c', 'line', { keep: true });
    await removeSongFiles('b');
    for (const k of ['file', 'vocal', 'line']) expect(await getFile('b', k)).toBeNull();
    expect(await getFile('c', 'line')).toEqual({ keep: true });
  });

  test('無いものは null', async () => {
    expect(await getFile('nai', 'vocal')).toBeNull();
  });

  test('容量が足りない（QuotaExceededError）→ quota', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(await putFile('d', 'line', { a: 1 })).toEqual({ ok: false, reason: 'quota' });
  });

  test('ほかの失敗 → other。例外は外に出ない', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('なにか');
    });
    expect(await putFile('e', 'line', { a: 1 })).toEqual({ ok: false, reason: 'other' });
  });

  test('あとから（非同期で）容量エラーが来ても quota', async () => {
    const orig = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...args) {
      const req = orig.apply(this, args);
      // 要求のエラーだけが入り、tx.error はまだ空、という順番を再現する
      // 中止の前に onerror だけが来て、tx.error はまだ空、という順番を再現する
      const tx = this.transaction;
      req.addEventListener('success', () => {
        tx.onerror({ target: { error: new DOMException('full', 'QuotaExceededError') } });
      });
      return req;
    });
    expect(await putFile('f', 'line', { a: 1 })).toEqual({ ok: false, reason: 'quota' });
  });
});

describe('つながりが切れたとき・読めなかったとき（iPhone で IndexedDB のつながりが切れることがある）', () => {
  test('transaction が InvalidStateError → 開きなおして1回だけやりなおす', async () => {
    await putFile('r1', 'line', { a: 1 });
    const orig = IDBDatabase.prototype.transaction;
    let calls = 0;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (...args) {
      calls += 1;
      if (calls === 1) throw new DOMException('closed', 'InvalidStateError');
      return orig.apply(this, args);
    });
    expect(await getFile('r1', 'line')).toEqual({ a: 1 });
    expect(calls).toBe(2);
  });

  test('UnknownError でも1回だけやりなおす。2回とも失敗なら書き込みは other', async () => {
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new DOMException('gone', 'UnknownError');
    });
    expect(await putFile('r2', 'line', { a: 1 })).toEqual({ ok: false, reason: 'other' });
    expect(IDBDatabase.prototype.transaction).toHaveBeenCalledTimes(2);
  });

  test('つながりが閉じた（onclose）ら、次は開きなおす', async () => {
    vi.resetModules();
    const fresh = await import('../../src/storage/songFiles.js');
    const opened = [];
    const origOpen = indexedDB.open.bind(indexedDB);
    vi.spyOn(indexedDB, 'open').mockImplementation((...args) => {
      const req = origOpen(...args);
      opened.push(req);
      return req;
    });
    await fresh.putFile('r3', 'line', { a: 1 });
    expect(opened).toHaveLength(1);
    const db = opened[0].result;
    db.onclose();
    expect(await fresh.getFile('r3', 'line')).toEqual({ a: 1 });
    expect(opened).toHaveLength(2);
  });

  test('ほかの画面が新しい版を開く（onversionchange）と、閉じて次は開きなおす', async () => {
    vi.resetModules();
    const fresh = await import('../../src/storage/songFiles.js');
    const opened = [];
    const origOpen = indexedDB.open.bind(indexedDB);
    vi.spyOn(indexedDB, 'open').mockImplementation((...args) => {
      const req = origOpen(...args);
      opened.push(req);
      return req;
    });
    await fresh.putFile('r4', 'line', { a: 1 });
    const db = opened[0].result;
    const close = vi.spyOn(db, 'close');
    db.onversionchange();
    expect(close).toHaveBeenCalled();
    await fresh.getFile('r4', 'line');
    expect(opened).toHaveLength(2);
  });

  test('読み出しの失敗は「無い（null）」と区別する', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
      throw new Error('読めない');
    });
    const got = await getFile('r5', 'file');
    expect(got).not.toBeNull();
    expect(isReadFailure(got)).toBe(true);
    expect(isReadFailure(null)).toBe(false);
    expect(isReadFailure({ hopMs: 20, midi: [] })).toBe(false);
  });

  test('listSongIds：置き場にある曲の id を重ならずに返す（id に : があっても）', async () => {
    await putFile('x1', 'file', { a: 1 });
    await putFile('x1', 'line', { a: 1 });
    await putFile('x:2', 'vocal', { a: 1 });
    const ids = await listSongIds();
    expect(ids).toContain('x1');
    expect(ids).toContain('x:2');
    expect(ids.filter((i) => i === 'x1')).toHaveLength(1);
  });

  test('listSongIds が読めないときは null（消しすぎないように）', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'getAllKeys').mockImplementation(() => {
      throw new Error('読めない');
    });
    expect(await listSongIds()).toBeNull();
  });
});
