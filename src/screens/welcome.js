// はじめての画面。まだ見ていない人は、どこを開いてもまずここ
import { go } from '../router.js';
import { loadState, setWelcomed } from '../storage/store.js';
import { button, heading, note, safetyList } from '../ui/components.js';
import { SAFETY_LINES, PRIVACY_LINE } from '../data/copy.js';

// ルーターの見張り。welcome と safety 以外は、見終わるまで welcome へ
export function guardWelcome(name) {
  if (loadState().welcomed) return null;
  return name === 'welcome' || name === 'safety' ? null : 'welcome';
}

export function renderWelcome(root) {
  root.append(
    heading('こえトレへ ようこそ'),
    note('音の 高さを 聞き分ける 練習と、声を 高さに 合わせる 練習が できます。'),
    safetyList(SAFETY_LINES),
    note(PRIVACY_LINE),
    button('はじめる', () => {
      setWelcomed();
      go('home');
    }),
  );
}
