import { describe, test, expect } from 'vitest';
import { makePrecacheList, makeVersion } from '../scripts/precache.js';

const files = ['index.html', 'sw.js', 'manifest.webmanifest', 'assets/index-AAA.js', 'assets/index-BBB.css', 'assets/index-AAA.js.map', 'icons/icon-192.png'];

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
    expect(makeVersion(files)).toBe(makeVersion([...files].reverse()));
    expect(makeVersion(files)).not.toBe(makeVersion(files.map((f) => f.replace('AAA', 'CCC'))));
  });
});
