// せってい：声の地図の測りなおし・記録の書き出し/読み込み・案内・クレジット
import { go } from '../router.js';
import { button, heading, note } from '../ui/components.js';
import { exportBackup, importBackup, requestPersist } from '../storage/store.js';
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

const defaultDeps = { download: downloadFile };

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
  requestPersist(); // 開いたとき一度だけ、記録を消さないようブラウザにお願いする

  function draw(message) {
    const input = importInput((text) => {
      const ok = text !== null && importBackup(text).ok;
      draw(ok ? '読み込みました' : 'この ファイルは 読み込めません');
    });
    root.replaceChildren(
      heading('せってい'),
      button('声の 地図を 測りなおす', () => go('stage2')),
      button('記録を ファイルに 書き出す', () => deps.download(`koetore-backup-${todayString()}.json`, exportBackup())),
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
