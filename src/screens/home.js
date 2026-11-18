// ホーム画面（仮）。あとの作業で、練習の入り口を作る
export function renderHome(root) {
  const title = document.createElement('h1');
  title.textContent = 'こえトレ';
  root.append(title);
}
