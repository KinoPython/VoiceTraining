// 「帯の中に1秒いられたか」の判定。
// 帯 = 目標の音の上下 toleranceCents の幅。ここに holdMs いられたら成功。
import { centsOff, foldOctave } from './notes.js';
import { CONFIG } from './config.js';

export function createHoldJudge({
  targetMidi,
  toleranceCents,
  holdMs = CONFIG.hold.holdMs,
  gapMs = CONFIG.hold.gapMs,
  allowOctave = false,
}) {
  let insideMs = 0;
  let active = false; // 帯の中にいる流れが続いているか
  let prevInside = false; // 直前のフレームが帯の中だったか（経過時間を足してよいか）
  let prevMs = null;
  let noVoiceSince = null; // 声が途切れ始めた時刻
  let doneShift = null; // done になったときの octaveShift

  // 帯の外に出た・長く途切れたときは最初からやり直す
  function reset() {
    insideMs = 0;
    active = false;
    prevInside = false;
  }

  // 声を cents に直す。オクターブ違いを許すときは、近い高さにたたむ
  function measure(midi) {
    const raw = centsOff(midi, targetMidi);
    return allowOctave ? foldOctave(raw) : { cents: raw, octaveShift: 0 };
  }

  function result(state, direction, octaveShift) {
    return { state, direction, insideMs, octaveShift };
  }

  function update(midi, nowMs) {
    // 成功したら、そのあとは何が来ても done のまま
    if (doneShift !== null) return result('done', null, doneShift);
    const elapsed = prevMs === null ? 0 : nowMs - prevMs;
    prevMs = nowMs;

    if (midi === null) {
      // 声が無い間は時間を足さない。短い切れ目なら積んだ分を残す
      if (noVoiceSince === null) noVoiceSince = nowMs;
      if (nowMs - noVoiceSince > gapMs) reset();
      prevInside = false;
      return result(active ? 'inside' : 'waiting', null, 0);
    }
    noVoiceSince = null;

    const { cents, octaveShift } = measure(midi);
    if (Math.abs(cents) > toleranceCents) {
      reset();
      return result('waiting', cents > 0 ? 'high' : 'low', octaveShift);
    }

    active = true;
    // 切れ目の直後の1フレームは、切れ目の時間を足さない
    if (prevInside) insideMs += elapsed;
    prevInside = true;
    if (insideMs >= holdMs) {
      doneShift = octaveShift;
      return result('done', null, octaveShift);
    }
    return result('inside', null, octaveShift);
  }

  return { update };
}
