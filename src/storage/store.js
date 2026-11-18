// 記録の保存。スマホの中（localStorage）だけに置き、外には送らない。
// iOS のプライベートモードなどで localStorage が例外を出しても、アプリは止めない。
const KEY = 'koetore.v1';

// 初めの形。毎回あたらしく作る（呼び出し側が書きかえても、元の形が変わらないように）
function initialState() {
  return {
    version: 1,
    range: null,
    levels: { s1: 0, s3: 0, s4: 0, s5: 0 },
    history: [],
    welcomed: false,
  };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// 保存された中身に、足りないキーを初めの形から補う（古い版・一部だけの記録でも読めるように）
function fillMissing(stored) {
  const base = initialState();
  if (!isObject(stored)) return base;
  return {
    version: 1,
    range: isObject(stored.range) ? stored.range : null,
    levels: { ...base.levels, ...(isObject(stored.levels) ? stored.levels : {}) },
    history: Array.isArray(stored.history) ? stored.history : [],
    welcomed: stored.welcomed === true,
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
