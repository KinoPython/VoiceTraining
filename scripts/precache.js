// ビルド結果のファイル名から、Service Worker に渡す「先に保存するファイル一覧」と「版の印」を作る
import { createHash } from 'node:crypto';

// sw.js 自身と .map は保存しない。入り口の './' も足す
export function makePrecacheList(fileNames) {
  const files = fileNames
    .filter((name) => name !== 'sw.js' && !name.endsWith('.map'))
    .map((name) => `./${name}`)
    .sort();
  return ['./', ...files];
}

// 一覧が変われば印も変わる（JS・CSS の名前は中身で決まるので、中身が変われば印も変わる）
export function makeVersion(fileNames) {
  return createHash('sha256').update(makePrecacheList(fileNames).join('\n')).digest('hex').slice(0, 10);
}
