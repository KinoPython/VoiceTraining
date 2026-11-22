// 記録の保存。スマホの中（localStorage）だけに置き、外には送らない。
// iOS のプライベートモードなどで localStorage が例外を出しても、アプリは止めない。
import { CONFIG } from '../logic/config.js';

const KEY = 'koetore.v1';

// 初めの形。毎回あたらしく作る（呼び出し側が書きかえても、元の形が変わらないように）
function initialState() {
  return {
    version: 1,
    range: null,
    levels: { s1: 0, s3: 0, s4: 0, s5: 0 },
    history: [],
    welcomed: false,
    songs: [],
  };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// 1回分の記録として使える形か（段の番号が 1〜6 の整数）。
// こわれた記録がまじると、ホームやきろくの画面が開けなくなるため
const isHistoryEntry = (e) => isObject(e) && Number.isInteger(e.stage) && e.stage >= 1 && e.stage <= 6;

// 曲の区間として使える形か。こわれた区間がまじると、練習の画面が開けなくなるため
const isLastLine = (l) => l === null || (Array.isArray(l) && l.every((p) => isObject(p) && isNum(p.t) && (p.midi === null || isNum(p.midi))));
const isSection = (x) => isObject(x) && typeof x.id === 'string' && typeof x.name === 'string'
  && isNum(x.startSec) && isNum(x.endSec) && isLastLine(x.lastLine)
  && (x.lastRatio === null || isNum(x.lastRatio));

// 曲として使える形か。ファイルやお手本の線はここには入れない（別の置き場。バックアップにも入れない）
const isSong = (x) => isObject(x) && typeof x.id === 'string' && typeof x.title === 'string'
  && typeof x.hasFile === 'boolean' && typeof x.hasVocal === 'boolean'
  && isNum(x.durationSec) && isNum(x.keyAdvice) && Array.isArray(x.sections);

// 決まった項目だけ残す（よぶんな項目がバックアップに紛れこまないように）
function cleanSong(x) {
  return {
    id: x.id, title: x.title, hasFile: x.hasFile, hasVocal: x.hasVocal,
    durationSec: x.durationSec, keyAdvice: x.keyAdvice,
    sections: x.sections.filter(isSection).slice(0, CONFIG.stage6.maxSections).map((c) => ({
      id: c.id, name: c.name, startSec: c.startSec, endSec: c.endSec,
      lastLine: c.lastLine, lastRatio: c.lastRatio,
    })),
  };
}

// レベルを 0〜最大に収める。数でなければ 0（はしごの計算がおかしくならないように）
const clampLevel = (v) => (isNum(v) ? Math.min(Math.max(v, 0), CONFIG.ladder.maxLevel) : 0);

function cleanLevels(stored) {
  const levels = initialState().levels;
  if (!isObject(stored)) return levels;
  for (const key of Object.keys(levels)) {
    if (key in stored) levels[key] = clampLevel(stored[key]);
  }
  return levels;
}

// 保存された中身に、足りないキーを初めの形から補う（古い版・一部だけの記録でも読めるように）
function fillMissing(stored) {
  const base = initialState();
  if (!isObject(stored)) return base;
  return {
    version: 1,
    range: isObject(stored.range) ? stored.range : null,
    levels: cleanLevels(stored.levels),
    history: Array.isArray(stored.history) ? stored.history.filter(isHistoryEntry) : [],
    welcomed: stored.welcomed === true,
    songs: Array.isArray(stored.songs) ? stored.songs.filter(isSong).map(cleanSong) : [],
  };
}

export function loadState() {
  try {
    const text = localStorage.getItem(KEY);
    return text ? fillMissing(JSON.parse(text)) : initialState();
  } catch {
    return initialState(); // こわれていたら初めの形に戻す
  }
}

// 書き込みの失敗は呼び出し側に伝えない（記録できなくても練習は続けられる）
function writeState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 何もしない
  }
}

function update(change) {
  const state = loadState();
  change(state);
  writeState(state);
}

export const saveRange = (range) => update((s) => { s.range = range; });
export const setLevel = (stage, level) => update((s) => { s.levels[stage] = level; });
export const addHistory = (entry) => update((s) => { s.history.push(entry); });
export const setWelcomed = () => update((s) => { s.welcomed = true; });


// 曲・区間の id。randomUUID が使えない古い環境では、時刻＋乱数で代わりにする
export const newId = () => (globalThis.crypto?.randomUUID
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

// 曲の記録。ファイルそのものは songFiles.js（IndexedDB）に置く
export const addSong = (song) => update((s) => { s.songs.push(song); });
export const updateSong = (id, patch) => update((s) => {
  const i = s.songs.findIndex((x) => x.id === id);
  if (i >= 0) s.songs[i] = { ...s.songs[i], ...patch, id }; // id は書きかえさせない
});
export const removeSong = (id) => update((s) => { s.songs = s.songs.filter((x) => x.id !== id); });
export const getSong = (id) => loadState().songs.find((x) => x.id === id) ?? null;

// 区間を足す（同じ id なら上書き）。1曲に maxSections まで。曲が無いときも 'max' ではなく例外にしない
export function saveSection(songId, section) {
  let result = { ok: false, reason: 'max' };
  update((s) => {
    const song = s.songs.find((x) => x.id === songId);
    if (!song) return;
    const i = song.sections.findIndex((c) => c.id === section.id);
    if (i >= 0) {
      song.sections[i] = section;
    } else if (song.sections.length < CONFIG.stage6.maxSections) {
      song.sections.push(section);
    } else {
      return;
    }
    result = { ok: true };
  });
  return result;
}
export const removeSection = (songId, sectionId) => update((s) => {
  const song = s.songs.find((x) => x.id === songId);
  if (song) song.sections = song.sections.filter((c) => c.id !== sectionId);
});

export const exportBackup = () => JSON.stringify(loadState());

// 取り込める形か。ちがうときは理由の文字列、よければ null
function checkBackup(data) {
  if (!isObject(data)) return '記録の形がちがいます';
  if (data.version !== 1) return '対応していない版の記録です';
  const lv = data.levels;
  if (!isObject(lv) || !['s1', 's3', 's4', 's5'].every((k) => isNum(lv[k]))) {
    return 'レベルの記録の形がちがいます';
  }
  if (!Array.isArray(data.history)) return '練習の記録の形がちがいます';
  const r = data.range;
  if (r !== null && !(isObject(r) && isNum(r.comfort) && isNum(r.low) && isNum(r.high))) {
    return '声の地図の形がちがいます';
  }
  return null;
}

export function importBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: '読み込めないファイルです' };
  }
  const problem = checkBackup(data);
  if (problem) return { ok: false, reason: problem };
  writeState(fillMissing(data));
  return { ok: true };
}

// 「記録を消さないで」とブラウザにお願いする。使えない環境では何もしない
export function requestPersist() {
  try {
    navigator.storage?.persist?.();
  } catch {
    // 何もしない
  }
}
