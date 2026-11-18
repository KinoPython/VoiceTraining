// 画面の切り替え。URLの「#名前?キー=値」を見て、登録された描画関数を呼ぶ
const routes = {};
let rootEl = null;
let currentDispose = null; // いまの画面の後始末（描画関数が関数を返したとき。マイクを止めるのに使う）
let renderId = 0;

export function register(name, render) {
  routes[name] = render; // 同じ名前なら置き換わる
}

// テストで登録を空に戻すため
export function resetRoutes() {
  for (const name of Object.keys(routes)) delete routes[name];
  rootEl = null;
  currentDispose = null;
  window.removeEventListener('hashchange', renderCurrent);
}

export function go(name, params) {
  const query = params ? new URLSearchParams(params).toString() : '';
  location.hash = query ? `#${name}?${query}` : `#${name}`;
}

// "#stage1?x=1" を 名前とパラメータに分ける
function parseHash() {
  const [rawName, query = ''] = location.hash.replace(/^#/, '').split('?');
  const name = routes[rawName] ? rawName : 'home'; // 知らない名前はホーム
  return { name, params: new URLSearchParams(query) };
}

// 後始末は一度だけ呼ぶ。失敗しても次の画面は出す
async function runDispose(dispose) {
  if (typeof dispose !== 'function') return;
  try {
    await dispose();
  } catch {
    // 後始末の失敗で画面が出なくならないように
  }
}

async function renderCurrent() {
  const { name, params } = parseHash();
  const render = routes[name];
  if (!render || !rootEl) return;
  const myId = ++renderId;
  const previous = currentDispose;
  currentDispose = null;
  await runDispose(previous);
  if (myId !== renderId) return; // 後始末を待つあいだに別の画面へ移った
  // 画面ごとに新しい入れ物に描く。遅れて終わった前の画面が、新しい画面に混ざらないように
  const screen = document.createElement('div');
  screen.className = 'screen';
  rootEl.replaceChildren(screen);
  try {
    const dispose = await render(screen, params);
    // 描画中に別の画面へ移っていたら、この画面はすぐ後始末する
    if (myId !== renderId) await runDispose(dispose);
    else currentDispose = dispose;
  } catch (error) {
    console.error(error);
    if (myId !== renderId) return;
    rootEl.textContent = 'うまく開けませんでした。もういちど開いてみてください。';
  }
}

export async function start(root) {
  rootEl = root;
  window.removeEventListener('hashchange', renderCurrent);
  window.addEventListener('hashchange', renderCurrent);
  await renderCurrent();
}
