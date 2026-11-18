import './styles.css';
import { register, start, setGuard, go } from './router.js';
import { renderHome } from './screens/home.js';
import { renderWelcome, guardWelcome } from './screens/welcome.js';
import { renderSafety } from './screens/safety.js';
import { renderWarmup } from './screens/warmup.js';
import { renderStage1 } from './screens/stage1.js';
import { renderStage2 } from './screens/stage2.js';
import { renderStage3 } from './screens/stage3.js';
import { button, heading } from './ui/components.js';

// あとの作業で作る画面の仮。ホームのリンクが行き止まりにならないように置く
function placeholder(root) {
  root.append(heading('準備中'), button('ホームへ', () => go('home')));
}

register('home', renderHome);
register('welcome', renderWelcome);
register('safety', renderSafety);
register('warmup', renderWarmup);
register('stage1', (root, params) => renderStage1(root, params));
register('stage2', (root, params) => renderStage2(root, params));
register('stage3', (root, params) => renderStage3(root, params));
for (const name of ['stage4', 'stage5', 'record', 'settings', 'article', 'learn']) {
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
