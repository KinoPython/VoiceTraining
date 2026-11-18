import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makePrecacheList, makeVersion, fillServiceWorker } from '../scripts/precache.js';

const files = ['index.html', 'sw.js', 'manifest.webmanifest', 'assets/index-AAA.js', 'assets/index-BBB.css', 'assets/index-AAA.js.map', 'icons/icon-192.png'];

// ファイルの中身のふり。名前ごとに決まった文字を返す
const contents = (overrides = {}) => (name) => Buffer.from(overrides[name] ?? `中身:${name}`);

describe('先に保存する一覧', () => {
  test('入り口と全ファイルを入れ、sw.js と .map は入れない', () => {
    const list = makePrecacheList(files);
    expect(list).toContain('./');
    expect(list).toContain('./assets/index-AAA.js');
    expect(list).toContain('./assets/index-BBB.css');
    expect(list).toContain('./icons/icon-192.png');
    expect(list).toContain('./manifest.webmanifest');
    expect(list).not.toContain('./sw.js');
    expect(list).not.toContain('./assets/index-AAA.js.map');
  });

  test('版の印は、ファイル名が変われば変わり、同じなら同じ', () => {
    expect(makeVersion(files, contents())).toBe(makeVersion([...files].reverse(), contents()));
    expect(makeVersion(files, contents())).not.toBe(makeVersion(files.map((f) => f.replace('AAA', 'CCC')), contents()));
  });

  test('版の印は、名前が同じでも中身が変われば変わる（index.html だけ直したときなど）', () => {
    const before = makeVersion(files, contents());
    const after = makeVersion(files, contents({ 'index.html': '<p>新しい</p>' }));
    expect(after).not.toBe(before);
  });
});

describe('sw.js の目印の書きかえ', () => {
  const source = "const A = 'koetore-' + '__BUILD_VERSION__';\nconst B = '__PRECACHE_LIST__';";

  test('2つの目印を、版の印と一覧に書きかえる', () => {
    const out = fillServiceWorker(source, { version: 'abc123', list: ['./', './index.html'] });
    expect(out).toContain("'abc123'");
    expect(out).toContain('["./","./index.html"]');
    expect(out).not.toContain('__BUILD_VERSION__');
    expect(out).not.toContain('__PRECACHE_LIST__');
  });

  test('目印が見つからなければ、ビルドを止める（古い保存分が残り続けないように）', () => {
    expect(() => fillServiceWorker('const A = 1;', { version: 'v', list: [] })).toThrow();
    expect(() => fillServiceWorker("'__PRECACHE_LIST__'", { version: 'v', list: [] })).toThrow();
    expect(() => fillServiceWorker('__BUILD_VERSION__', { version: 'v', list: [] })).toThrow();
  });
});

// 本物の public/sw.js を、偽の self と caches の上で動かす
function runServiceWorker() {
  const listeners = {};
  const added = [];
  const fakeSelf = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => {},
    location: { origin: 'https://example.test' },
    clients: { claim: async () => {} },
  };
  const fakeCaches = {
    open: async () => ({ addAll: async (list) => { added.push(...list); } }),
    keys: async () => [],
  };
  class FakeRequest {
    constructor(url, init) { this.url = url; this.cache = init?.cache; }
  }
  const raw = readFileSync(resolve('public/sw.js'), 'utf8');
  const code = fillServiceWorker(raw, { version: 'test', list: ['./', './index.html'] });
  new Function('self', 'caches', 'Request', code)(fakeSelf, fakeCaches, FakeRequest);
  return { listeners, added };
}

describe('Service Worker の先に保存', () => {
  test('ブラウザの一時保存を通さず（cache: reload）、新しいファイルを取りにいく', async () => {
    const { listeners, added } = runServiceWorker();
    let waiting;
    listeners.install({ waitUntil: (p) => { waiting = p; } });
    await waiting;
    expect(added.map((r) => r.url)).toEqual(['./', './index.html']);
    expect(added.every((r) => r.cache === 'reload')).toBe(true);
  });
});

describe('ライセンスの全文', () => {
  const text = readFileSync(resolve('public/licenses.txt'), 'utf8');

  // node_modules の元のファイルの文が、そのまま入っているか
  test('pitchy の LICENSE をそのまま含む', () => {
    expect(text).toContain(readFileSync(resolve('node_modules/pitchy/LICENSE'), 'utf8').trim());
  });

  test('fft.js の LICENSE（README の節）の著作権と許可の文を含む', () => {
    expect(text).toContain('Copyright Fedor Indutny, 2017.');
    expect(text).toContain('The above copyright notice and this permission notice shall be included');
    expect(text.match(/Permission is hereby granted/g)).toHaveLength(2);
  });

  test('先に保存する一覧に入る（電波がなくても読めるように）', () => {
    expect(makePrecacheList(['index.html', 'licenses.txt'])).toContain('./licenses.txt');
  });
});

describe('公開の手順（GitHub Actions）', () => {
  test('ビルドの前に npm test を走らせる（テストが通らないと公開しない）', () => {
    const yml = readFileSync(resolve('.github/workflows/pages.yml'), 'utf8');
    const testAt = yml.indexOf('run: npm test');
    expect(testAt).toBeGreaterThan(-1);
    expect(testAt).toBeLessThan(yml.indexOf('npm run build'));
  });
});
