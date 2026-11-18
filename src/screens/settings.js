// せってい：声の地図の測りなおし・記録の書き出し/読み込み・案内・クレジット
import { go } from '../router.js';
import { button, heading, note } from '../ui/components.js';
import { exportBackup, importBackup, requestPersist } from '../storage/store.js';
import { todayString } from '../logic/today.js';

// ファイルとして保存する。いったん見えないリンクを作ってクリックし、終わったら URL を捨てる
function downloadFile(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const defaultDeps = { download: downloadFile };

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
      note('pitchy（声の 高さの 計算） — MIT License'),
      button('ホームへ', () => go('home')),
    );
    input.hidden = true; // ボタンから開く（見た目をそろえるため）
  }

  draw(null);
}
