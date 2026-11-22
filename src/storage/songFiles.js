// 曲のファイル・歌声だけのファイル・お手本の線の置き場（IndexedDB）。
// スマホの中だけに置き、外には送らない。バックアップにも入れない。
const DB_NAME = 'koetore-files';
const STORE = 'files';
const KINDS = ['file', 'vocal', 'line'];

let dbPromise = null;

// iPhone では、しばらく裏にいるとつながりが切れることがある。
// 切れた・ほかの画面が新しい版を開いたときは覚えておかず、次に開きなおす
function forget(db) {
  db.onclose = () => { dbPromise = null; };
  db.onversionchange = () => {
    dbPromise = null;
    db.close(); // 閉じないと、新しい版を開く側がずっと待たされる
  };
}

// 開くのは最初の1回だけ。失敗したときは次のために覚えておかない
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => { forget(req.result); resolve(req.result); };
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

// つながりが切れたときに出る失敗。開きなおせば通ることが多い
const isLostConnection = (e) => e && (e.name === 'InvalidStateError' || e.name === 'UnknownError');

// 1回の書き込み・読み出しを、終わるまで待てる形にする
function runOnce(mode, work) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const out = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    // onerror は中止の前に来ることがあり、そのとき tx.error はまだ空。原因は個々の要求（e.target）から取る
    tx.onerror = (e) => reject(e.target?.error ?? tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('abort', 'AbortError'));
  }));
}

// つながりが切れていたら、開きなおして1回だけやりなおす（何度もやると画面が待たされるため）
async function run(mode, work) {
  try {
    return await runOnce(mode, work);
  } catch (e) {
    if (!isLostConnection(e)) throw e;
    dbPromise = null;
    return runOnce(mode, work);
  }
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

// 「読めなかった」の印。「無い（null）」とは別にする。
// 読めなかっただけでファイルはあるかもしれないので、選びなおしを促さないため
export const READ_FAILED = Object.freeze({ readFailed: true });
export const isReadFailure = (value) => value === READ_FAILED;

// 無ければ null、読めなかったら READ_FAILED（isReadFailure で見分ける）
export async function getFile(songId, kind) {
  try {
    const value = await run('readonly', (store) => store.get(keyOf(songId, kind)));
    return value ?? null;
  } catch {
    return READ_FAILED;
  }
}

// 置き場にある曲の id の一覧（重ならない）。読めなければ null（消しすぎないように）
export async function listSongIds() {
  try {
    const keys = await run('readonly', (store) => store.getAllKeys());
    const ids = new Set();
    for (const key of keys) {
      const cut = String(key).lastIndexOf(':'); // id に : があっても、最後の : で切る
      if (cut > 0 && KINDS.includes(String(key).slice(cut + 1))) ids.add(String(key).slice(0, cut));
    }
    return [...ids];
  } catch {
    return null;
  }
}

export async function removeSongFiles(songId) {
  try {
    await run('readwrite', (store) => {
      for (const kind of KINDS) store.delete(keyOf(songId, kind));
    });
  } catch {
    // 消せなくても止めない
  }
}
