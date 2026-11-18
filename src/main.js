import './styles.css';
import { register, start, setGuard, go } from './router.js';
import { renderHome } from './screens/home.js';
import { renderWelcome, guardWelcome } from './screens/welcome.js';
import { renderSafety } from './screens/safety.js';
import { renderWarmup } from './screens/warmup.js';
import { button, heading } from './ui/components.js';

// あとの作業で作る画面の仮。ホームのリンクが行き止まりにならないように置く
function placeholder(root) {
  root.append(heading('準備中'), button('ホームへ', () => go('home')));
}

register('home', renderHome);
register('welcome', renderWelcome);
register('safety', renderSafety);
register('warmup', renderWarmup);
for (const name of ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'record', 'settings', 'article', 'learn']) {
  register(name, placeholder);
}
setGuard(guardWelcome);
start(document.getElementById('app'));

// オフラインでも開けるように。開発中は古い保存分が邪魔になるので、本番のビルドだけ登録する
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // 登録できなくてもアプリは使える
  });
}
