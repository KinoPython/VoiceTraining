import { defineConfig } from 'vite';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makePrecacheList, makeVersion } from './scripts/precache.js';

// dist の中のファイルを、サブフォルダも含めて「dist からの相対パス」で集める
function listFiles(dir, base = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name), `${base}${entry.name}/`) : [`${base}${entry.name}`]
  );
}

// ビルド後に dist/sw.js の目印を、保存するファイル一覧と版の印に書きかえる。
// 版の印がキャッシュ名に入るので、新しく公開するたびに古い保存分が入れ替わる
function serviceWorkerPlugin() {
  let outDir = 'dist';
  return {
    name: 'sw-precache',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle() {
      const files = listFiles(outDir);
      const swPath = join(outDir, 'sw.js');
      const source = readFileSync(swPath, 'utf8')
        .replace('__BUILD_VERSION__', makeVersion(files))
        .replace("'__PRECACHE_LIST__'", JSON.stringify(makePrecacheList(files)));
      writeFileSync(swPath, source);
    },
  };
}

// base を './' にして、GitHub Pages のどんなフォルダ名の下でも動くようにする
export default defineConfig({ base: './', plugins: [serviceWorkerPlugin()] });
