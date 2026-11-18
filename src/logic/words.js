// 画面の文に使ってはいけない言葉（効果の言い切り・責める言葉・日数の圧力）。
// テストで画面の文を調べるときに使う。
export const BANNED = ['治る', '治す', '必ず', '絶対', '失敗', '不合格', 'ダメ', '連続', '日連続'];

// 文の中に入っている禁止の言葉を全部返す（なければ空の配列）
export function findBanned(text) {
  return BANNED.filter((word) => text.includes(word));
}
