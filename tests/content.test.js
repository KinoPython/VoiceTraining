import { describe, test, expect } from 'vitest';
import tips from '../src/data/tips.json';
import { ARTICLES as articles } from '../src/screens/article.js';
import { findBanned } from '../src/logic/words.js';

// 記事の画面に出る文を全部ならべる（出典の題名も画面に出る）
function articleTexts(a) {
  return [a.title, a.summary, ...a.body, ...a.today, ...a.cautions, ...a.sources.map((s) => s.title)];
}

describe('段ごとのコツ', () => {
  test.each(['s1', 's2', 's3', 's4', 's5'])('%s は 3〜6個で、1つ 40字まで', (key) => {
    const list = tips[key];
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.length).toBeLessThanOrEqual(6);
    for (const t of list) expect(t.length).toBeLessThanOrEqual(40);
  });

  test('禁止の言葉がない', () => {
    for (const t of Object.values(tips).flat()) expect(findBanned(t)).toEqual([]);
  });
});

describe('読みもの', () => {
  test('4本そろい、id が決まった名前', () => {
    expect(articles.map((a) => a.id)).toEqual(['posture', 'breath', 'relax', 'pitch-ear']);
  });

  test.each(articles.map((a) => [a.id, a]))('%s：出典・注意・日付がそろう', (_id, a) => {
    expect(a.sources.length).toBeGreaterThanOrEqual(1);
    for (const s of a.sources) {
      expect(s.url.startsWith('https://')).toBe(true);
      expect(s.title).toBeTruthy();
      expect(s.publisher).toBeTruthy();
    }
    expect(a.cautions.some((c) => c.includes('耳鼻咽喉科'))).toBe(true);
    expect(a.cautions.some((c) => c.includes('医療・リハビリ・診断の 代わりでは ありません'))).toBe(true);
    // 4週間の目安を書くときは、強い症状は待たずに受診する一文もそろえる
    for (const c of a.cautions.filter((x) => x.includes('4週間'))) expect(c).toContain('待たずに');
    expect(a.body.length).toBeGreaterThan(0);
    expect(a.today.length).toBeGreaterThan(0);
    expect(a.updatedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('禁止の言葉がなく、治療・予防をうたわない', () => {
    for (const a of articles) {
      for (const t of articleTexts(a)) {
        expect(findBanned(t)).toEqual([]);
        // 「医療・リハビリ・診断の 代わりでは ありません」は、うたわない ための 注意なので除く
        expect(t.replace('医療・リハビリ・診断の 代わりでは', '')).not.toMatch(/予防|治療|リハビリ|改善する/);
      }
    }
  });
});
