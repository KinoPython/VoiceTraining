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
      audio.addEventListener('timeupdate', tick);
      sources[name] = { audio, url };
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
        // 聞くだけのとき（speaker）だけ下のスピーカーを借りる。歌うときは借りない
        release: speaker ? borrowSpeaker() : null,
        rafId: 0,
      };
      current = session;
      session.rafId = raf(frame);
      // iPhone は押した直後でないと再生を拒むことがある。拒まれたら借りを返して知らせる
      Promise.resolve(audio.play()).then(
        undefined,
        (error) => {
          if (current === session) {
            current = null;
            cancelRaf(session.rafId);
            session.release?.();
          }
          reject(error);
        },
      );
    });
  }

  function dispose() {
    stop();
    Object.values(sources).forEach(({ url }) => URL.revokeObjectURL(url));
    Object.keys(sources).forEach((name) => delete sources[name]);
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
