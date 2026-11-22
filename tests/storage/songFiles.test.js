import { Blob as NodeBlob } from 'node:buffer';
import { describe, test, expect, vi, afterEach } from 'vitest';
import { putFile, getFile, removeSongFiles } from '../../src/storage/songFiles.js';

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
});
