// マイクが開けなかったときの案内。理由ごとに、次にすることを書く
import { go } from '../router.js';
import { button, heading, note } from './components.js';

const MESSAGES = {
  denied: "マイクが 使えません。iPhone の『設定』→『Safari』→『マイク』で『許可』に して、もう一度 開いて ください。",
  nodevice: 'マイクが 見つかりません。イヤホンの マイクなどを つないで ください。',
  unsupported: 'この ブラウザでは マイクが 使えません。iPhone の Safari で 開いて ください。',
};

export function renderMicGuide(root, reason) {
  const text = MESSAGES[reason] ?? MESSAGES.unsupported; // other は unsupported と同じ文
  root.replaceChildren(heading('マイクの こと'), note(text), button('ホームへ', () => go('home')));
}
