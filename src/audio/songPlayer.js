// 曲（または歌声だけのファイル）の、選んだ区間を鳴らす。
// 速さを変えても高さが変わらないようにし、区間の終わりで止める（またはくり返す）。
import { borrowSpeaker } from './tone.js';

const defaultRaf = (cb) => window.requestAnimationFrame(cb);
const defaultCancelRaf = (id) => window.cancelAnimationFrame(id);

export function createSongPlayer({
  fileBlob,
  vocalBlob,
  createAudio = (url) => new Audio(url),
  raf = defaultRaf,
  cancelRaf = defaultCancelRaf,
}) {
  const blobs = { file: fileBlob ?? null, vocal: vocalBlob ?? null };
  const sources = {}; // 'file' | 'vocal' → { audio, url }。使うときに1回だけ作る
  let current = null; // いま再生中の { audio, section, release, resolve, rafId }
  let lastAudio = null; // currentSec 用（止めたあとの位置も返せるように）
  let timeCallback = null;
  let disposed = false;

  // 指定の source が無ければ、ある方を使う
  function pickSource(wanted) {
    if (blobs[wanted]) return wanted;
    return blobs.file ? 'file' : blobs.vocal ? 'vocal' : null;
  }

  function sourceFor(name) {
    if (!sources[name]) {
      const url = URL.createObjectURL(blobs[name]);
      const audio = createAudio(url);
      // timeupdate は約250msおきと粗いので、区間の終わりは rAF でも見る。こちらは念のための保険
      // ended：toSec がファイルの長さ以上だと currentTime が toSec に届かず止まるので、ここで区間の終わりにする
      // error：読めない・壊れたファイルで待ち続けないため
      const listeners = {
        timeupdate: tick,
        ended: () => onEnded(audio),
        error: () => onError(audio),
      };
      Object.entries(listeners).forEach(([type, fn]) => audio.addEventListener(type, fn));
      sources[name] = { audio, url, listeners };
    }
    return sources[name];
  }

  // 区間を終える：止めて、スピーカーの借りを返し、待っている play を resolve する
  function finish(session) {
    if (current !== session) return;
    current = null;
    cancelRaf(session.rafId);
    session.audio.pause();
    session.release?.();
    session.resolve();
  }

  // 再生できなかったとき：借りを返し、待っている play を reject する
  function fail(session, error) {
    if (current !== session) return;
    current = null;
    cancelRaf(session.rafId);
    session.release?.();
    session.reject(error);
  }

  // 再生を始める。同期で投げられても、拒否されても、同じ後始末にする
  function start(session) {
    try {
      Promise.resolve(session.audio.play()).then(undefined, (error) => fail(session, error));
    } catch (error) {
      fail(session, error);
    }
  }

  function onEnded(audio) {
    const session = current;
    if (!session || session.audio !== audio) return;
    if (session.loop) {
      audio.currentTime = session.fromSec;
      start(session); // ended のあとは止まっているので、もう一度再生する
    } else {
      finish(session);
    }
  }

  function onError(audio) {
    const session = current;
    if (session && session.audio === audio) fail(session, audio.error ?? new Error('曲を再生できません'));
  }

  // 位置を見て、画面へ知らせ、区間の終わりなら戻る／止まる
  function tick() {
    const session = current;
    if (!session) return;
    const { audio, fromSec, toSec, loop } = session;
    timeCallback?.(audio.currentTime);
    if (audio.currentTime >= toSec) {
      if (loop) audio.currentTime = fromSec;
      else finish(session);
    }
  }

  function frame() {
    tick();
    if (current) current.rafId = raf(frame);
  }

  function stop() {
    if (current) finish(current);
  }

  function play({ fromSec, toSec, rate, source, loop, speaker }) {
    if (disposed) return Promise.reject(new Error('プレーヤーは閉じています'));
    stop(); // 前の再生は止める（その play は resolve される）
    const name = pickSource(source);
    if (!name) return Promise.reject(new Error('曲のデータがありません'));
    const { audio } = sourceFor(name);
    lastAudio = audio;
    audio.playbackRate = rate;
    audio.preservesPitch = true; // 遅くしても高さを変えない
    audio.webkitPreservesPitch = true; // 古い iPhone の名前
    audio.currentTime = fromSec;

    return new Promise((resolve, reject) => {
      const session = {
        audio,
        fromSec,
        toSec,
        loop,
        resolve,
        reject,
        // 聞くだけのとき（speaker）だけ下のスピーカーを借りる。歌うときは借りない
        release: speaker ? borrowSpeaker() : null,
        rafId: 0,
      };
      current = session;
      session.rafId = raf(frame);
      // iPhone は押した直後でないと再生を拒むことがある。拒まれたら借りを返して知らせる
      start(session);
    });
  }

  function dispose() {
    stop();
    disposed = true;
    Object.values(sources).forEach(({ audio, url, listeners }) => {
      Object.entries(listeners).forEach(([type, fn]) => audio.removeEventListener(type, fn));
      // 曲のデータを手放す（src を空にして読み込みを止める）
      audio.removeAttribute?.('src');
      audio.load?.();
      URL.revokeObjectURL(url);
    });
    Object.keys(sources).forEach((name) => delete sources[name]);
    lastAudio = null;
    timeCallback = null;
  }

  return {
    play,
    stop,
    currentSec: () => lastAudio?.currentTime ?? 0,
    onTime(cb) {
      timeCallback = cb;
    },
    dispose,
  };
}
