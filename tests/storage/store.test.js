import { describe, test, expect, beforeEach } from 'vitest';
import {
  loadState, saveRange, setLevel, addHistory, setWelcomed,
  exportBackup, importBackup, requestPersist,
} from '../../src/storage/store.js';

const KEY = 'koetore.v1';
const range = { comfort: 60, low: 55, high: 67, widened: false, measuredOn: '2026-11-18' };
const entry = (n = 0) => ({ date: '2026-11-18', stage: 1, tries: 5, successes: 3 + n, value: 2 });

beforeEach(() => localStorage.clear());

describe('loadState', () => {
  test('何も無いとき初めの形', () => {
    expect(loadState()).toEqual({
      version: 1, range: null, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: [], welcomed: false,
    });
  });

  test('こわれた文字列でも初めの形で、例外にならない', () => {
    localStorage.setItem(KEY, '{こわれた');
    expect(loadState().history).toEqual([]);
    expect(loadState().range).toBeNull();
  });

  test('毎回あたらしいオブジェクトを返す（書きかえても保存に響かない）', () => {
    loadState().levels.s1 = 9;
    expect(loadState().levels.s1).toBe(0);
  });

  test('足りないキーは初めの形で補う', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, levels: { s1: 3 } }));
    const s = loadState();
    expect(s.levels).toEqual({ s1: 3, s3: 0, s4: 0, s5: 0 });
    expect(s.history).toEqual([]);
    expect(s.welcomed).toBe(false);
  });
});

describe('保存', () => {
  test('saveRange は loadState に残る', () => {
    saveRange(range);
    expect(loadState().range).toEqual(range);
  });

  test('setLevel と setWelcomed', () => {
    setLevel('s3', 4);
    setWelcomed();
    expect(loadState().levels.s3).toBe(4);
    expect(loadState().welcomed).toBe(true);
  });

  test('addHistory を3回で長さ3', () => {
    addHistory(entry(0)); addHistory(entry(1)); addHistory(entry(2));
    expect(loadState().history).toHaveLength(3);
  });

  test('書き込みに失敗しても例外にならない', () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('private mode'); };
    try {
      expect(() => saveRange(range)).not.toThrow();
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
});

describe('バックアップ', () => {
  test('書き出し → 消す → 読み込みで同じ中身', () => {
    saveRange(range); setLevel('s4', 2); addHistory(entry());
    const before = loadState();
    const text = exportBackup();
    localStorage.clear();
    expect(importBackup(text)).toEqual({ ok: true });
    expect(loadState()).toEqual(before);
  });

  test('version が 1 でないものは断り、前の記録はそのまま', () => {
    saveRange(range);
    const before = loadState();
    const r = importBackup('{"version":2}');
    expect(r.ok).toBe(false);
    expect(typeof r.reason).toBe('string');
    expect(loadState()).toEqual(before);
  });

  test('JSON でない・形がちがうものは断る', () => {
    saveRange(range);
    const before = loadState();
    const bad = [
      'こわれた',
      'null',
      JSON.stringify({ version: 1, levels: { s1: 0 }, history: [], range: null }),
      JSON.stringify({ version: 1, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: {}, range: null }),
      JSON.stringify({ version: 1, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: [], range: { comfort: 1 } }),
    ];
    for (const t of bad) expect(importBackup(t).ok).toBe(false);
    expect(loadState()).toEqual(before);
  });
});

describe('requestPersist', () => {
  test('navigator.storage が無くても何も起きない', () => {
    expect(() => requestPersist()).not.toThrow();
  });
});
