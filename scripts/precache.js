// ビルド結果のファイルから、Service Worker に渡す「先に保存するファイル一覧」と「版の印」を作る
import { createHash } from 'node:crypto';

const VERSION_MARK = '__BUILD_VERSION__';
const LIST_MARK = "'__PRECACHE_LIST__'";

// 先に保存するファイル（sw.js 自身と .map は保存しない）
function precachedFiles(fileNames) {
  return fileNames.filter((name) => name !== 'sw.js' && !name.endsWith('.map')).sort();
}

// 入り口の './' も足した一覧
export function makePrecacheList(fileNames) {
  return ['./', ...precachedFiles(fileNames).map((name) => `./${name}`)];
}

// 名前と「中身」から印を作る。index.html のように名前が変わらないファイルを直したときも、
// 印が変わって古い保存分が入れ替わるように。readFile(name) はファイルの中身（バイト）を返す
export function makeVersion(fileNames, readFile) {
  const hash = createHash('sha256');
  for (const name of precachedFiles(fileNames)) {
    hash.update(`${name}\n`);
    hash.update(readFile(name));
    hash.update('\n');
  }
  return hash.digest('hex').slice(0, 10);
}

// sw.js の目印を書きかえる。目印が見つからないときはビルドを止める
// （書きかえ忘れのまま公開すると、古い保存分がずっと残ってしまうため）
export function fillServiceWorker(source, { version, list }) {
  if (!source.includes(VERSION_MARK) || !source.includes(LIST_MARK)) {
    throw new Error('sw.js の目印（__BUILD_VERSION__ / __PRECACHE_LIST__）が見つかりません');
  }
  return source.replace(VERSION_MARK, version).replace(LIST_MARK, JSON.stringify(list));
}
