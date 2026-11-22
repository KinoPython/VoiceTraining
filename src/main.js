import './styles.css';
import { register, start, setGuard, go } from './router.js';
import { button, heading } from './ui/components.js';
import { renderHome } from './screens/home.js';
import { renderWelcome, guardWelcome } from './screens/welcome.js';
import { renderSafety } from './screens/safety.js';
import { renderWarmup } from './screens/warmup.js';
import { renderStage1 } from './screens/stage1.js';
import { renderStage2 } from './screens/stage2.js';
import { renderStage3 } from './screens/stage3.js';
import { renderStage4 } from './screens/stage4.js';
import { renderStage5 } from './screens/stage5.js';
import { renderStage6List } from './screens/stage6List.js';
import { renderStage6Song } from './screens/stage6Song.js';
import { renderRecord } from './screens/record.js';
import { renderSettings } from './screens/settings.js';
import { renderLearn, renderArticle } from './screens/article.js';

register('home', renderHome);
register('welcome', renderWelcome);
register('safety', renderSafety);
register('warmup', renderWarmup);
register('stage1', (root, params) => renderStage1(root, params));
register('stage2', (root, params) => renderStage2(root, params));
register('stage3', (root, params) => renderStage3(root, params));
register('stage4', (root, params) => renderStage4(root, params));
register('stage5', (root, params) => renderStage5(root, params));
register('stage6', (root, params) => renderStage6List(root, params));
register('song', (root, params) => renderStage6Song(root, params));
// 歌声だけのファイルの作り方（Task 8）ができるまでの仮の画面
const placeholder = (root) => {
  root.replaceChildren(heading('準備中'), button('ホームへ', () => go('home')));
};
register('vocalGuide', placeholder);
register('record', renderRecord);
register('settings', (root, params) => renderSettings(root, params));
register('learn', renderLearn);
register('article', (root, params) => renderArticle(root, params));
setGuard(guardWelcome);
start(document.getElementById('app'));

// オフラインでも開けるように。開発中は古い保存分が邪魔になるので、本番のビルドだけ登録する
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // 登録できなくてもアプリは使える
  });
}
