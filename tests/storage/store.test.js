import { describe, test, expect, beforeEach } from 'vitest';
import {
  loadState, saveRange, setLevel, addHistory, setWelcomed,
  exportBackup, importBackup, requestPersist,
  addSong, updateSong, removeSong, getSong, saveSection, removeSection, newId,
} from '../../src/storage/store.js';

const KEY = 'koetore.v1';
const range = { comfort: 60, low: 55, high: 67, widened: false, measuredOn: '2026-11-18' };
const entry = (n = 0) => ({ date: '2026-11-18', stage: 1, tries: 5, successes: 3 + n, value: 2 });

beforeEach(() => localStorage.clear());

describe('loadState', () => {
  test('何も無いとき初めの形', () => {
    expect(loadState()).toEqual({
      version: 1, range: null, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: [], welcomed: false, songs: [],
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

describe('こわれた中身の掃除', () => {
  const base = { version: 1, range: null, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: [], welcomed: true };

  test('stage が 1〜5 の数でない記録は捨てる', () => {
    const good = entry(0);
    localStorage.setItem(KEY, JSON.stringify({
      ...base,
      history: [null, 3, 'x', [], { stage: 9 }, { stage: '1' }, { stage: 0 }, { stage: 2.5 }, good],
    }));
    expect(loadState().history).toEqual([good]);
  });

  test('レベルは 0〜最大に収め、数でなければ 0', () => {
    localStorage.setItem(KEY, JSON.stringify({ ...base, levels: { s1: -3, s3: 99, s4: 'abc', s5: 4 } }));
    expect(loadState().levels).toEqual({ s1: 0, s3: 10, s4: 0, s5: 4 });
  });

  test('history が [null] の記録も読み込めて、空の履歴になる', () => {
    expect(importBackup(JSON.stringify({ ...base, history: [null] }))).toEqual({ ok: true });
    expect(loadState().history).toEqual([]);
  });

  test('levels.s3 が 99 の記録を読み込むと、最大レベルに収まる', () => {
    expect(importBackup(JSON.stringify({ ...base, levels: { ...base.levels, s3: 99 } }))).toEqual({ ok: true });
    expect(loadState().levels.s3).toBe(10);
  });
});

const section = (id, extra = {}) => ({
  id, name: 'サビ', startSec: 10, endSec: 30, lastLine: [{ t: 0, midi: 60 }, { t: 0.02, midi: null }], lastRatio: 0.5, ...extra,
});
const song = (id = 's1', extra = {}) => ({
  id, title: 'テスト曲', hasFile: true, hasVocal: false, durationSec: 200, sections: [], keyAdvice: 0, ...extra,
});

describe('段6：曲の記録', () => {
  test('newId は毎回ちがう文字列', () => {
    expect(typeof newId()).toBe('string');
    expect(newId()).not.toBe(newId());
  });

  test('addSong → getSong で同じ。removeSong で消える', () => {
    addSong(song());
    expect(getSong('s1')).toEqual(song());
    expect(loadState().songs).toHaveLength(1);
    removeSong('s1');
    expect(getSong('s1')).toBeNull();
  });

  test('updateSong で一部だけ変える', () => {
    addSong(song());
    updateSong('s1', { title: '新しい名前', keyAdvice: 2 });
    expect(getSong('s1').title).toBe('新しい名前');
    expect(getSong('s1').keyAdvice).toBe(2);
    expect(getSong('s1').durationSec).toBe(200);
  });

  test('saveSection は 5 つまで。6 つ目は max', () => {
    addSong(song());
    for (let i = 0; i < 5; i++) expect(saveSection('s1', section(`a${i}`))).toEqual({ ok: true });
    expect(saveSection('s1', section('a5'))).toEqual({ ok: false, reason: 'max' });
    expect(getSong('s1').sections).toHaveLength(5);
  });

  test('同じ id の区間は上書き（上限にはあたらない）、removeSection で消える', () => {
    addSong(song());
    for (let i = 0; i < 5; i++) saveSection('s1', section(`a${i}`));
    expect(saveSection('s1', section('a0', { lastRatio: 0.9 }))).toEqual({ ok: true });
    expect(getSong('s1').sections[0].lastRatio).toBe(0.9);
    removeSection('s1', 'a0');
    expect(getSong('s1').sections).toHaveLength(4);
  });

  test('曲がないときの saveSection は例外にならない', () => {
    expect(saveSection('nai', section('a'))).toEqual({ ok: false, reason: 'max' });
  });

  test('history に stage 6 は残り、stage 7 は捨てられる', () => {
    addHistory({ date: '2026-11-19', stage: 6, tries: 3, successes: 2, value: 0.7, songTitle: 'テスト曲' });
    addHistory({ date: '2026-11-19', stage: 7, tries: 3, successes: 2, value: 0.7 });
    const h = loadState().history;
    expect(h).toHaveLength(1);
    expect(h[0].songTitle).toBe('テスト曲');
  });

  test('バックアップに曲名・区間・lastLine は入り、ファイルやお手本の線は入らない', () => {
    addSong(song('s1', { sections: [section('a')] }));
    const text = exportBackup();
    expect(text).toContain('テスト曲');
    expect(text).toContain('"lastLine"');
    const back = JSON.parse(text).songs[0];
    expect(Object.keys(back).sort()).toEqual(
      ['durationSec', 'hasFile', 'hasVocal', 'id', 'keyAdvice', 'sections', 'title']);
    expect(text).not.toMatch(/blob|"line"/i);
  });

  test('変な形の songs は捨てられ、例外にならない', () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 1,
      songs: [null, 5, { ...song('x'), title: 123 }, song('ok', { sections: [null, section('good'), { id: 1 }] })],
    }));
    const s = loadState();
    expect(s.songs.map((x) => x.id)).toEqual(['ok']);
    expect(s.songs[0].sections.map((x) => x.id)).toEqual(['good']);
  });

  test('songs が配列でないときは空', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, songs: 'へん' }));
    expect(loadState().songs).toEqual([]);
  });

  test('古い記録（songs なし）でも取り込める', () => {
    const old = { version: 1, range: null, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: [], welcomed: false };
    expect(importBackup(JSON.stringify(old))).toEqual({ ok: true });
    expect(loadState().songs).toEqual([]);
  });
});
