// YouTube の公式の埋め込みプレーヤー（IFrame Player API）を包む、アプリで唯一の場所。
// ほかのファイルは、ここが返す YtPlayer（play/pause/seekTo…）だけを使う。
// 曲のダウンロードはしない。公式の埋め込みプレーヤーだけを使う。
//
// 【公式ページで未確認の API の事実】（この環境から公式ページを開けなかったため、
//  よく知られた使い方から書いた。持ち主が公式ページで確かめること）
//  1. スクリプトの場所 https://www.youtube.com/iframe_api と、準備ができたときに
//     呼ばれる window.onYouTubeIframeAPIReady という名前
//  2. new YT.Player(要素, { videoId, host, playerVars, events:{onReady,onStateChange,onError} })
//     の形。host に 'https://www.youtube-nocookie.com' を渡せること
//  3. playerVars の playsinline / rel / origin / controls の名前と値
//  4. メソッド名と引数：playVideo / pauseVideo / seekTo(秒, allowSeekAhead) /
//     getCurrentTime / getDuration / setPlaybackRate / getAvailablePlaybackRates / destroy
//  5. 状態の番号：-1 未開始、0 終了、1 再生中、2 一時停止、3 バッファ中、5 頭出し済み
//  6. エラー番号の意味（ytErrorKey のコメントを見る）。onError の event.data に番号が入ること
import { CONFIG } from '../logic/config.js';

const API_SRC = 'https://www.youtube.com/iframe_api';

const namedError = (name, message, extra = {}) => Object.assign(new Error(message), { name }, extra);

// <script async src> を足して、読み終わりを待つ。失敗したら、やりなおせるように tag を消す
export function defaultLoadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.async = true;
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => {
      el.remove();
      reject(namedError('YtLoadError', 'YouTube の API を読めませんでした'));
    };
    document.head.appendChild(el);
  });
}

// 同時に何回呼ばれても1回だけ読む。失敗は覚えない（次の呼び出しでやりなおす）
const inFlight = new WeakMap(); // win → Promise

export function loadYouTubeApi({
  loadScript = defaultLoadScript,
  timeoutMs = CONFIG.stage6.yt.apiTimeoutMs,
  win = window,
} = {}) {
  if (win.YT?.Player) return Promise.resolve(win.YT);
  if (inFlight.has(win)) return inFlight.get(win);

  const promise = new Promise((resolve, reject) => {
    const previous = win.onYouTubeIframeAPIReady;
    let timer = null;
    const fail = (err) => {
      clearTimeout(timer);
      // 自分の受け口を外して、もとの受け口に戻す
      win.onYouTubeIframeAPIReady = previous;
      reject(err);
    };
    win.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      if (typeof previous === 'function') previous();
      resolve(win.YT);
    };
    timer = setTimeout(() => fail(namedError('YtTimeout', 'YouTube の API の読み込みが 時間切れです')), timeoutMs);
    Promise.resolve()
      .then(() => loadScript(API_SRC))
      .catch((e) => fail(e?.name === 'YtLoadError' ? e : namedError('YtLoadError', String(e?.message ?? e))));
  });

  inFlight.set(win, promise);
  // 失敗したら覚えない
  promise.catch(() => {
    if (inFlight.get(win) === promise) inFlight.delete(win);
  });
  return promise;
}

// YT の状態番号 → 名前（-1 の未開始は無視する）
const STATE_NAMES = { 1: 'playing', 2: 'paused', 0: 'ended', 3: 'buffering', 5: 'cued' };

export function createYtPlayer(container, { videoId, YT, onState, onError } = {}) {
  return new Promise((resolve, reject) => {
    let ready = false;
    let destroyed = false;
    let raw = null;

    const wrap = () => {
      const availableRates = () => raw.getAvailablePlaybackRates?.() ?? [];
      return {
        play: () => raw.playVideo(),
        pause: () => raw.pauseVideo(),
        seekTo: (sec) => raw.seekTo(sec, true),
        currentSec: () => raw.getCurrentTime(),
        duration: () => raw.getDuration(),
        availableRates,
        // 使える速さの中でいちばん近いもの（同じ近さなら遅い方）に合わせ、実際の値を返す
        setRate(rate) {
          const rates = availableRates();
          if (!rates.length) return 1;
          let best = rates[0];
          for (const r of rates) {
            const d = Math.abs(r - rate);
            const bd = Math.abs(best - rate);
            if (d < bd || (d === bd && r < best)) best = r;
          }
          raw.setPlaybackRate(best);
          return best;
        },
        destroy() {
          if (destroyed) return;
          destroyed = true;
          raw.destroy();
        },
      };
    };

    raw = new YT.Player(container, {
      host: 'https://www.youtube-nocookie.com',
      videoId,
      playerVars: { playsinline: 1, rel: 0, origin: location.origin, controls: 1 },
      events: {
        onReady: () => {
          ready = true;
          resolve(wrap());
        },
        onStateChange: (e) => {
          const name = STATE_NAMES[e?.data];
          if (name) onState?.(name);
        },
        onError: (e) => {
          const code = e?.data;
          if (!ready) reject(namedError('YtPlayerError', `YouTube のエラー ${code}`, { code }));
          else onError?.(code);
        },
      },
    });
  });
}

// エラー番号 → 案内文の種類。
// 公式で未確認：101・150 は「持ち主が埋め込みを許していない」、100 は「見つからない／非公開」、
// 2 は「動画 ID が正しくない」、153 は「リファラ（開いた元）がない」と理解している。
export function ytErrorKey(code) {
  if (code === 101 || code === 150) return 'notEmbeddable';
  if (code === 100) return 'notFound';
  if (code === 2) return 'badId';
  if (code === 153) return 'noReferer';
  return 'other';
}
