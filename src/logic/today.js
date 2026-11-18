// 履歴に入れる日付。端末の「今日」（UTC ではなく）で YYYY-MM-DD にする
export function todayString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
