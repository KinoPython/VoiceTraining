// せってい：声の地図の測りなおし・記録の書き出し/読み込み・案内・クレジット
import { go } from '../router.js';
import { button, heading, note } from '../ui/components.js';
import { exportBackup, importBackup, loadState, requestPersist } from '../storage/store.js';
import { listSongIds, removeSongFiles } from '../storage/songFiles.js';
import { todayString } from '../logic/today.js';

// ファイルとして保存する。iPhone の Safari は、画面に付いていないリンクや、
// すぐ捨てた URL だとファイルを失うことがある。なので body に付けてクリックし、URL は少し待ってから捨てる
export const REVOKE_DELAY_MS = 1000;
export function downloadFile(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

const defaultDeps = {
  download: downloadFile,
  confirm: (text) => window.confirm(text),
  listSongIds,
  removeSongFiles,
};

export const CONFIRM_IMPORT = 'このスマホの 曲で、バックアップに 無い ものは 消えます。読み込みますか？';

// 読み込んだあとの記録に無い曲のファイルを消す（容量をあける）。
// 置き場の一覧が読めないときは、使っている曲まで消さないよう何もしない
async function sweepFiles(d) {
  const ids = await d.listSongIds();
  if (!ids) return;
  const known = new Set(loadState().songs.map((s) => s.id));
  for (const id of ids) {
    if (!known.has(id)) await d.removeSongFiles(id);
  }
}

// 使っているほかの人のプログラム。MIT License は「著作権の文と許可の文を添える」決まりなので、
// 著作権の文はここに、全文は licenses.txt（電波がなくても読めるよう先に保存する）に置く
const CREDITS = [
  'pitchy（声の 高さの 計算） — MIT License。Copyright 2018-2021 Ian Johnson',
  'fft.js（pitchy の 中で 使う 計算） — MIT License。Copyright Fedor Indutny, 2017.',
];

function licenseLink() {
  const a = document.createElement('a');
  a.href = './licenses.txt';
  a.textContent = 'ライセンスの 全文を 見る';
  const p = note('');
  p.append(a);
  return p;
}

function importInput(onText) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      onText(await file.text());
    } catch {
      onText(null); // 読めなかったときも、こわれたファイルと同じ扱い
    }
  });
  return input;
}

export function renderSettings(root, params, deps = defaultDeps) {
  const d = { ...defaultDeps, ...deps };
  requestPersist(); // 開いたとき一度だけ、記録を消さないようブラウザにお願いする

  function draw(message) {
    const input = importInput(async (text) => {
      if (text === null) return draw('この ファイルは 読み込めません');
      // 曲が1つでもあれば、置きかわって消える曲があることを先に伝える（「いいえ」なら何も変えない）
      const asked = loadState().songs.length > 0;
      if (asked && !d.confirm(CONFIRM_IMPORT)) return draw('読み込みを やめました');
      if (!importBackup(text).ok) return draw('この ファイルは 読み込めません');
      // 確認に「はい」と答えたときだけ掃除する。壊れたファイルでは何も消さない
      if (asked) await sweepFiles(d);
      draw('読み込みました');
    });
    root.replaceChildren(
      heading('せってい'),
      button('声の 地図を 測りなおす', () => go('stage2')),
      button('記録を ファイルに 書き出す', () => d.download(`koetore-backup-${todayString()}.json`, exportBackup())),
      button('ファイルから 読み込む', () => input.click()),
      input,
      ...(message ? [note(message)] : []),
      note('ホーム画面に 追加すると、記録が 消えにくく なります'),
      button('安全の こと', () => go('safety')),
      heading('クレジット'),
      ...CREDITS.map(note),
      licenseLink(),
      button('ホームへ', () => go('home')),
    );
    input.hidden = true; // ボタンから開く（見た目をそろえるため）
  }

  draw(null);
}
