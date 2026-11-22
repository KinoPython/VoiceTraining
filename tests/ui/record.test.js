import { describe, test, expect, beforeEach } from 'vitest';
import { renderRecord } from '../../src/screens/record.js';
import { findBanned } from '../../src/logic/words.js';

const range = { comfort: 60, low: 55, high: 67 };
function seed(patch) {
  const base = { version: 1, range: null, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: [], welcomed: true };
  localStorage.setItem('koetore.v1', JSON.stringify({ ...base, ...patch }));
}
function open() {
  const root = document.createElement('div');
  renderRecord(root);
  return root;
}

describe('きろく', () => {
  beforeEach(() => localStorage.clear());

  test('記録が空なら案内を出す', () => {
    const root = open();
    expect(root.textContent).toContain('練習すると、ここに');
    expect(root.querySelectorAll('circle').length).toBe(0);
  });

  test('段1の3日ぶんで、折れ線の点が3つ', () => {
    seed({ history: [
      { date: '2026-11-16', stage: 1, tries: 5, successes: 3, value: 4 },
      { date: '2026-11-17', stage: 1, tries: 5, successes: 4, value: 3 },
      { date: '2026-11-18', stage: 1, tries: 5, successes: 5, value: 2 },
    ] });
    const root = open();
    expect(root.querySelectorAll('svg.trend circle').length).toBe(3);
    expect(root.querySelectorAll('polyline').length).toBe(1);
    expect(root.textContent).toContain('下に 行くほど、細かく 聞き分けられて います');
  });

  test('同じ日に2回なら、その日の最小値の点が1つ', () => {
    seed({ history: [
      { date: '2026-11-18', stage: 1, tries: 5, successes: 3, value: 4 },
      { date: '2026-11-18', stage: 1, tries: 5, successes: 3, value: 2 },
    ] });
    const root = open();
    expect(root.querySelectorAll('svg.trend circle').length).toBe(1);
    expect(root.querySelector('polyline')).toBeNull();
    expect(root.textContent).toContain('差の 目安：ドと レ');
  });

  test('日ごとの一覧は新しい日が上で、段ごとの文が出る', () => {
    seed({ range, history: [
      { date: '2026-11-17', stage: 2, tries: 1, successes: 1, value: 12 },
      { date: '2026-11-18', stage: 3, tries: 4, successes: 3, value: 0 },
      { date: '2026-11-18', stage: 5, tries: 6, successes: 4, value: 0.756 },
    ] });
    const t = open().textContent;
    expect(t.indexOf('2026-11-18')).toBeLessThan(t.indexOf('2026-11-17'));
    expect(t).toContain('幅 12 半音');
    expect(t).toContain('4回 中 3回 できた');
    expect(t).toContain('6回 中 4回 できた');
    expect(t).toContain('合いぐあい 平均 76%（目安）');
  });

  test('段6は曲ごとに1行：回数は足し、合いぐあいは回数で重みをつけた平均', () => {
    seed({ history: [
      { date: '2026-11-20', stage: 6, tries: 1, successes: 1, value: 1, songTitle: '青い空' },
      { date: '2026-11-20', stage: 6, tries: 3, successes: 2, value: 0.6, songTitle: '青い空' },
      { date: '2026-11-20', stage: 6, tries: 2, successes: 1, value: 0.5, songTitle: '夜のうた' },
    ] });
    const t = open().textContent;
    expect(t).toContain('好きな 曲：青い空　4回 中 3回 できた・合いぐあい 平均 70%（目安）');
    expect(t).toContain('好きな 曲：夜のうた　2回 中 1回 できた・合いぐあい 平均 50%（目安）');
    expect(findBanned(t)).toEqual([]);
  });

  test('段6で曲名が無い古い記録は「（曲名なし）」で出る', () => {
    seed({ history: [{ date: '2026-11-20', stage: 6, tries: 2, successes: 1, value: 0.5 }] });
    expect(open().textContent).toContain('好きな 曲：（曲名なし）　2回 中 1回 できた');
  });

  test('value が無い・数でない記録は平均から外し、「NaN%」を出さない（段5・段6）', () => {
    seed({ history: [
      { date: '2026-11-20', stage: 6, tries: 2, successes: 1, value: 0.5, songTitle: '青い空' },
      { date: '2026-11-20', stage: 6, tries: 3, successes: 1, songTitle: '青い空' },
      { date: '2026-11-20', stage: 6, tries: 1, successes: 0, value: 'へん', songTitle: '夜のうた' },
      { date: '2026-11-20', stage: 5, tries: 2, successes: 1, value: 0.8 },
      { date: '2026-11-20', stage: 5, tries: 2, successes: 1 },
    ] });
    const t = open().textContent;
    expect(t).not.toContain('NaN');
    expect(t).toContain('好きな 曲：青い空　5回 中 2回 できた・合いぐあい 平均 50%（目安）');
    expect(t).toContain('好きな 曲：夜のうた　1回 中 0回 できた');
    expect(t).not.toContain('夜のうた　1回 中 0回 できた・合いぐあい');
    expect(t).toContain('合いぐあい 平均 80%（目安）');
  });

  test('声の地図があれば鍵盤を出す', () => {
    seed({ range });
    expect(open().querySelector('svg.keyboard')).not.toBeNull();
  });

  test('禁止語と「連続」が無い', () => {
    seed({ range, history: [{ date: '2026-11-18', stage: 1, tries: 5, successes: 1, value: 5 }] });
    const t = open().textContent;
    expect(findBanned(t)).toEqual([]);
    expect(t).not.toContain('連続');
  });
});
