// 曲のファイル・歌声だけのファイル・お手本の線の置き場（IndexedDB）。
// スマホの中だけに置き、外には送らない。バックアップにも入れない。
const DB_NAME = 'koetore-files';
const STORE = 'files';

let dbPromise = null;

// 開くのは最初の1回だけ。失敗したときは次のために覚えておかない
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

const keyOf = (songId, kind) => `${songId}:${kind}`;

// 容量が足りないときだけ 'quota'、ほかは 'other'（画面で言葉を出し分けるため）
const reasonOf = (e) => (e && e.name === 'QuotaExceededError' ? 'quota' : 'other');

// 1回の書き込み・読み出しを、終わるまで待てる形にする
function run(mode, work) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const out = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('abort', 'AbortError'));
  }));
}

// 呼び出し側には例外を投げない（保存できなくても、画面は止めない）
export async function putFile(songId, kind, data) {
  try {
    await run('readwrite', (store) => { store.put(data, keyOf(songId, kind)); });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: reasonOf(e) };
  }
}

export async function getFile(songId, kind) {
  try {
    const value = await run('readonly', (store) => store.get(keyOf(songId, kind)));
    return value ?? null;
  } catch {
    return null;
  }
}

export async function removeSongFiles(songId) {
  try {
    await run('readwrite', (store) => {
      for (const kind of ['file', 'vocal', 'line']) store.delete(keyOf(songId, kind));
    });
  } catch {
    // 消せなくても止めない
  }
}
