// お手本の音を鳴らす。マイクと同じ AudioContext を1つだけ使い回す。
import { midiToHz } from '../logic/notes.js';

const ATTACK_SEC = 0.03; // 立ち上がり：いきなり鳴らすと「プツッ」とノイズが出るため
const RELEASE_SEC = 0.08; // 消え際：同じ理由
const PEAK_GAIN = 0.3; // 耳を痛めない控えめの音量
const SAFETY_MS = 300; // 終わりの知らせ（onended）が来ないときに待つ、長さ＋この分
const RELEASE_DELAY_MS = 200; // 音が続くときに切りかえがばたつかないよう、鳴り終わってから戻すまで待つ

let context = null;
const playing = new Map(); // いま鳴っている（予約済みを含む）オシレーター → その終わらせ方
let stopGeneration = 0; // stopAll のたびに増やし、playSequence の続きを打ち切る目印にする

// iPhone の音の出し方（audioSession）を変える。対応していない端末では何もしない
export function setAudioSessionType(type) {
  try {
    if (navigator.audioSession) navigator.audioSession.type = type;
  } catch {
    // 変えられなくても音は鳴らせる
  }
}

// --- スピーカーを借りる仕組み ---
// マイク使用中（play-and-record）の iPhone は、音を耳元の小さなスピーカーから鳴らす。
// 鳴らす間だけ playback にして下のスピーカーを使い、終わったら（マイクが開いていれば）戻す。
let micActive = false; // マイクが開いているか（mic.js が知らせる）
let borrowCount = 0; // いま借りている数（鳴っている音・聞き直しの数）
let restoreTimer = null;
let restoreWaiters = []; // whenSpeakerRestored を待っている人の resolve

function notifyRestored() {
  const waiters = restoreWaiters;
  restoreWaiters = [];
  waiters.forEach((resolve) => resolve());
}

export function setMicActive(active) {
  micActive = active;
  // マイクが閉じたら、もう戻さない。待っている人を待たせ続けない
  if (!active) notifyRestored();
}

// スピーカーを借りている間と、戻す予定の間は待ち、戻った（または戻さないと決まった）ら resolve する。
// 歌う判定は play-and-record に戻ってから始めるために使う
export function whenSpeakerRestored() {
  if (borrowCount === 0 && restoreTimer === null) return Promise.resolve();
  return new Promise((resolve) => restoreWaiters.push(resolve));
}

// 借りる。返す関数を返す（2回呼んでも1回分だけ返す。他の借りを返してしまわないため）
export function borrowSpeaker() {
  borrowCount += 1;
  clearTimeout(restoreTimer); // 戻す予定があれば取り消す（続けて鳴らすとき）
  restoreTimer = null;
  // 借りている間に openMic が play-and-record を書いても、次の音が耳元に戻らないよう毎回指定する
  setAudioSessionType('playback');
  let returned = false;
  return () => {
    if (returned) return;
    returned = true;
    borrowCount -= 1;
    if (borrowCount > 0) return;
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      restoreTimer = null;
      // 待つ間に誰かが借りた・マイクが閉じた場合は戻さない
      if (borrowCount === 0 && micActive) setAudioSessionType('play-and-record');
      notifyRestored();
    }, RELEASE_DELAY_MS);
  };
}

export function getAudioContext() {
  // マナーモードでも音が出るように。マイク使用中（play-and-record）のときは変えない
  if (navigator.audioSession?.type === 'auto') setAudioSessionType('playback');
  if (!context) {
    // 古い iPhone は webkit 付きの名前しかない
    const Ctor = window.AudioContext || window.webkitAudioContext;
    context = new Ctor();
  }
  // 止まっている（suspended）・電話などで中断された（interrupted）ときは、毎回起こす。
  // 起こせなくても次に押したときにまた試すので、失敗は無視する
  if (context.state !== 'running' && context.state !== 'closed') {
    context.resume().catch(() => {});
  }
  return context;
}

// 音量の形：0 → 立ち上がり → 保つ → 消え際 → 0
function shapeVolume(gain, startSec, endSec) {
  const attackEnd = Math.min(startSec + ATTACK_SEC, (startSec + endSec) / 2);
  const releaseStart = Math.max(attackEnd, endSec - RELEASE_SEC);
  gain.gain.setValueAtTime(0, startSec);
  gain.gain.linearRampToValueAtTime(PEAK_GAIN, attackEnd);
  gain.gain.setValueAtTime(PEAK_GAIN, releaseStart);
  gain.gain.linearRampToValueAtTime(0, endSec);
}

// 鳴り終わったときに resolve する
export function playNote(midi, durationMs, whenMs = 0) {
  const ctx = getAudioContext();
  const startSec = ctx.currentTime + whenMs / 1000;
  const endSec = startSec + durationMs / 1000;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle'; // 歌の高さを聞き取りやすい、やわらかい音
  osc.frequency.value = midiToHz(midi);
  shapeVolume(gain, startSec, endSec);
  osc.connect(gain);
  gain.connect(ctx.destination);

  return new Promise((resolve) => {
    const giveBack = borrowSpeaker(); // 鳴らす間は下のスピーカーを借りる
    let finished = false;
    // 終わりの知らせと安全タイマーの、早いほうで1回だけ終える
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      playing.delete(osc);
      giveBack();
      resolve();
    };
    // 中断中の iPhone では onended が来ないことがある。待ち続けて画面が止まらないように
    const timer = setTimeout(finish, whenMs + durationMs + SAFETY_MS);
    playing.set(osc, finish);
    osc.onended = finish;
    try {
      osc.start(startSec);
      osc.stop(endSec);
    } catch {
      finish(); // 鳴らせなかったら、借りたままにせず終える（練習は続けられる）
    }
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function playSequence(notes, pauseMs = 0) {
  const generation = stopGeneration;
  for (const note of notes) {
    if (generation !== stopGeneration) return; // 途中で止められた
    await playNote(note.midi, note.durationMs);
    if (pauseMs > 0 && generation === stopGeneration) await wait(pauseMs);
  }
}

export function stopAll() {
  stopGeneration += 1;
  for (const [osc, finish] of [...playing]) {
    try {
      osc.stop(); // すぐ止める。onended が呼ばれて playing から消える
    } catch {
      finish(); // 止められなくても、借りた分は返す
    }
  }
}
