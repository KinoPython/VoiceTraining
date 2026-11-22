// 段6②：YouTube の再生位置の時計と、くり返しの判定。
// YouTube の再生位置は細かく更新されないので、読んだ値の間は計算で滑らかにつなぐ。

const SNAP_SEC = 0.3; // 推定とこれ以上ずれたら、読んだ値に合わせなおす

export function createSongClock() {
  let sec = 0; // 最後に採った再生位置（秒）
  let at = 0; // そのときの時刻（ms）
  let playing = false;
  let rate = 1;
  let started = false;

  const estimate = (nowMs) => (playing && started ? sec + ((nowMs - at) * rate) / 1000 : sec);

  const update = (readSec, nowMs, isPlaying, newRate) => {
    // 再生・停止や速さが変わったとき、飛んだ・止まったときは、読んだ値に合わせなおす。
    // ふつうの小さなずれは、前の基準をそのまま使う（読みの細かいゆれで時計が震えないように）
    const changed = !started || isPlaying !== playing || newRate !== rate;
    if (changed || Math.abs(readSec - estimate(nowMs)) >= SNAP_SEC) {
      sec = readSec;
      at = nowMs;
    }
    playing = isPlaying;
    rate = newRate;
    started = true;
  };

  return { update, estimate };
}

// 区間（fromSec〜toSec）のくり返し：'continue'（そのまま）/ 'seek'（fromSec へ戻す）/ 'stop'（止める）
export function loopAction(currentSec, fromSec, toSec, loop) {
  if (currentSec >= toSec) return loop ? 'seek' : 'stop';
  if (currentSec < fromSec - 1) return loop ? 'seek' : 'continue'; // 区間より前に外れた
  return 'continue';
}
