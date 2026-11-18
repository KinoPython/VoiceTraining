import './styles.css';
import { register, start } from './router.js';
import { renderHome } from './screens/home.js';

register('home', renderHome);
start(document.getElementById('app'));

// オフラインでも開けるように。開発中は古い保存分が邪魔になるので、本番のビルドだけ登録する
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // 登録できなくてもアプリは使える
  });
}
