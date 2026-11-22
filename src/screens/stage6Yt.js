// 段6② YouTube で練習：公式の埋め込みプレーヤーで流し、区間をくり返し聞く（歌うのは次の手順で足す）
// 曲はダウンロードしない。YouTube に つながるのは、この画面のプレーヤーだけ
import { go } from '../router.js';
import { button, heading, note, safetyList } from '../ui/components.js';
import { loadYouTubeApi, createYtPlayer, ytErrorKey } from '../audio/ytPlayer.js';
import { loopAction } from '../logic/ytClock.js';
import { getSong, saveSection, removeSection, newId } from '../storage/store.js';
import { CONFIG } from '../logic/config.js';
import { STAGE6_TEXT as T, SAFETY_LINES } from '../data/copy.js';
import { TEXT, RATE_LABEL, nextSectionName } from './stage6Song.js';

const defaultDeps = {
  loadYouTubeApi,
  createYtPlayer,
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id),
  now: () => performance.now(), // 次の手順（歌う）で、再生位置の時計に使う
  confirm: (text) => window.confirm(text),
};

const WHICH = 'ytSections'; // YouTube の区間は、曲ファイルの区間とは別に持つ（時間の基準がちがうことがあるため）

// エラー番号の種類 → 案内の文
const PLAYER_ERROR_TEXT = {
  notEmbeddable: T.ytNotEmbeddable, notFound: T.ytNotFound, badId: T.ytBadId, noReferer: T.ytNoReferer, other: T.ytOther,
};

// 読み込みの失敗 → 案内の文。中止（画面を離れた）は null（何も出さない）
function loadErrorText(err) {
  if (err?.name === 'AbortError') return null;
  if (err?.name === 'YtTimeout' || err?.name === 'YtLoadError') return T.ytOffline;
  if (err?.name === 'YtPlayerError') return PLAYER_ERROR_TEXT[ytErrorKey(err.code)];
  return T.ytOther;
}

// 秒 → 「1:23」（位置の表示。秒は切り捨て）
function clockText(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// 秒 → 「1:23.5」（区間の端。0.5秒ずつ動かすので 0.1秒まで出す）
function edgeText(sec) {
  if (sec === null) return '－';
  const tenths = Math.round(sec * 10);
  return `${Math.floor(tenths / 600)}:${((tenths % 600) / 10).toFixed(1).padStart(4, '0')}`;
}

export function renderStage6Yt(root, params, deps = defaultDeps) {
  const d = { ...defaultDeps, ...deps };
  const songId = params?.get?.('id') ?? null;
  const song = getSong(songId);
  const abort = new AbortController(); // 画面を離れたら、読み込みの待ちもやめる
  let player = null;
  let pollId = null; // 再生中の確かめのタイマー
  let looping = false;
  let rate = 1;
  // { startSec, endSec, sectionId, dirty }。端はまだ決めていなければ null。
  // sectionId は元にした保存区間（無ければ null）。dirty は範囲を動かして保存と食いちがう印
  let selection = null;
  let controls = null; // 区間・速さのボタンの入れ物（プレーヤーの枠は描きなおさない）
  let message = null;
  let position = null;
  let disposed = false;

  const title = () => heading(song ? song.title : T.title);
  const setMessage = (text) => { if (message) message.textContent = text; };
  const ytSections = () => getSong(songId)?.ytSections ?? [];
  const savedSection = (id) => (id ? ytSections().find((c) => c.id === id) ?? null : null);
  // 動画の長さ。まだ分からない（0）ときは、上の端を決めない
  const durationSec = () => player?.duration() || Infinity;
  const isValid = (s) => s !== null && s.startSec !== null && s.endSec !== null
    && s.startSec >= 0 && s.endSec <= durationSec() && s.startSec < s.endSec - CONFIG.stage6.nudgeSec;

  // ---------- 片づけ ----------
  function stopPoll() {
    if (pollId !== null) d.clearInterval(pollId);
    pollId = null;
    looping = false;
  }

  // 二重に呼ばれても1回だけ destroy する
  function destroyPlayer() {
    stopPoll();
    const p = player;
    player = null;
    p?.destroy();
  }

  // ---------- 読み込み ----------
  async function load() {
    if (!song?.youtubeId) return showMissing();
    const holder = document.createElement('div'); // YouTube がこの中に iframe を作る
    const frame = document.createElement('div');
    frame.className = 'yt-frame';
    frame.append(holder);
    controls = document.createElement('div');
    controls.append(note(T.ytLoading));
    root.replaceChildren(title(), note(T.ytButton), note(T.ytEarphone), frame, controls);
    try {
      const YT = await d.loadYouTubeApi({ signal: abort.signal });
      if (disposed) return; // 離れたあとに読み終わっても、何も作らない
      const made = await d.createYtPlayer(holder, {
        videoId: song.youtubeId, YT, signal: abort.signal, onError: onPlayerError, onState: onPlayerState,
      });
      if (disposed) return made.destroy();
      player = made;
    } catch (err) {
      if (!disposed) showError(loadErrorText(err));
      return;
    }
    const first = ytSections()[0];
    if (first) selection = { startSec: first.startSec, endSec: first.endSec, sectionId: first.id, dirty: false };
    showControls('');
  }

  // YouTube の画面の中のボタンで流したときも、位置の表示を進める（くり返し中ならそのまま）
  function onPlayerState(name) {
    if (disposed || !player) return;
    if (name === 'playing' && pollId === null) startPoll(false);
    if (name === 'ended' && looping && isValid(selection)) return restartLoop();
    // くり返していないときは、止まっている間タイマーを止める（playing でまた動かす）
    if ((name === 'paused' || name === 'ended') && !looping) {
      stopPoll();
      showPosition();
    }
  }

  // 区間の終わりが動画の終わりと同じだと、位置が長さの少し手前のまま ended になり、
  // loopAction が 'seek' に届かないことがある。終わったら始まりへ戻して、もう一度流す
  function restartLoop() {
    player.seekTo(selection.startSec);
    player.play(); // ended のあとは、seekTo だけでは流れないことがある
  }

  // 準備のあとに来たエラー（埋め込みが止められた動画は、再生しようとして初めて分かることがある）
  function onPlayerError(code) {
    if (disposed) return;
    showError(PLAYER_ERROR_TEXT[ytErrorKey(code)]);
  }

  function showError(text) {
    destroyPlayer();
    if (text === null) return;
    message = null;
    root.replaceChildren(title(), note(text), button(TEXT.back, () => go('stage6')));
  }

  function showMissing() {
    root.replaceChildren(title(), note(T.ytBadId), button(TEXT.toList, () => go('stage6')));
  }

  // ---------- 流す・くり返す ----------
  // 位置の表示と、くり返しの確かめは、同じタイマー（pollMs ごと）で行う
  function tick() {
    if (!player) return;
    const sec = player.currentSec();
    if (looping && isValid(selection) && loopAction(sec, selection.startSec, selection.endSec, true) === 'seek') {
      player.seekTo(selection.startSec);
    }
    showPosition();
  }

  function startPoll(loop) {
    stopPoll();
    looping = loop;
    pollId = d.setInterval(tick, CONFIG.stage6.yt.pollMs);
  }

  function playHere() {
    player.play();
    startPoll(false);
  }

  function startLoop() {
    if (!isValid(selection)) return setMessage(rangeProblem());
    player.seekTo(selection.startSec);
    player.play();
    startPoll(true);
  }

  function stop() {
    stopPoll();
    player?.pause();
    showPosition();
  }

  const showPosition = () => {
    if (position && player) position.textContent = `${clockText(player.currentSec())} / ${clockText(player.duration())}`;
  };

  // 速さ：頼んだ値ではなく、YouTube が実際に使った値のボタンを選んだ状態にする
  function rateRow() {
    const row = document.createElement('div');
    row.className = 'choices';
    const buttons = CONFIG.stage6.yt.rates.map((r) => {
      const b = button(RATE_LABEL(r), () => {
        rate = player.setRate(r);
        markRate();
      });
      b.dataset.rate = String(r);
      return b;
    });
    const markRate = () => buttons.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === rate)));
    markRate();
    row.append(note(TEXT.rate), ...buttons);
    return row;
  }

  // ---------- 区間を決める ----------
  // まだ決めていない端があるとき・終わりが始まりに近すぎるときの案内
  const rangeProblem = () => (selection?.startSec == null || selection?.endSec == null ? T.ytPickFirst : T.ytBadRange);
  const clampSec = (sec) => Math.min(durationSec(), Math.max(0, Math.round(sec * 1000) / 1000));

  // 端を変えたとき：保存した区間が元なら、元の id を覚えたまま「保存と食いちがう」印をつける
  function changeRange(startSec, endSec) {
    const origin = selection?.sectionId ?? null;
    selection = { startSec, endSec, sectionId: origin, dirty: origin !== null };
    showControls('');
  }

  // 「ここを 始まりに／終わりに」：そのときの再生位置を端にする（流したまま押せる）
  function markEdge(edge) {
    const sec = clampSec(player.currentSec());
    const startSec = edge === 'start' ? sec : selection?.startSec ?? null;
    const endSec = edge === 'end' ? sec : selection?.endSec ?? null;
    changeRange(startSec, endSec);
  }

  // 端を nudgeSec ずつ動かす。動画の外には出さず、区間が短くなりすぎる・入れかわるときは動かさない
  function nudge(edge, delta) {
    if (selection?.startSec == null || selection?.endSec == null) return setMessage(T.ytPickFirst);
    let { startSec, endSec } = selection;
    if (edge === 'start') startSec = clampSec(startSec + delta);
    else endSec = clampSec(endSec + delta);
    if (!(startSec < endSec - CONFIG.stage6.nudgeSec)) return;
    changeRange(startSec, endSec);
  }

  function nudgeButtons() {
    const step = CONFIG.stage6.nudgeSec;
    const box = document.createElement('div');
    box.className = 'choices';
    box.append(
      button(TEXT.nudgeStartEarlier, () => nudge('start', -step)),
      button(TEXT.nudgeStartLater, () => nudge('start', step)),
      button(TEXT.nudgeEndEarlier, () => nudge('end', -step)),
      button(TEXT.nudgeEndLater, () => nudge('end', step)),
    );
    return box;
  }

  function sectionButtons() {
    const box = document.createElement('div');
    for (const c of ytSections()) {
      box.append(button(c.name, () => {
        stop();
        selection = { startSec: c.startSec, endSec: c.endSec, sectionId: c.id, dirty: false };
        showControls('');
      }));
    }
    return box;
  }

  // ---------- 区間の保存・消す・上書き（段6①の曲の画面と同じ決まり・同じ文） ----------
  function actionItems() {
    const items = [];
    if (selection?.sectionId) items.push(button(TEXT.remove, removeCurrent));
    if (selection?.dirty) {
      items.push(note(TEXT.notSaved), button(TEXT.overwrite, overwriteCurrent), button(TEXT.saveAsNew, saveCurrent));
    }
    return items;
  }

  function removeCurrent() {
    if (!selection?.sectionId || !d.confirm(TEXT.confirmRemove)) return;
    removeSection(songId, selection.sectionId, WHICH);
    selection = null; // 消したあとは何も選んでいない
    showControls('');
  }

  // 同じ id・新しい範囲で保存する。前回の線と合いぐあいは、範囲がちがうので消す
  function overwriteCurrent() {
    const target = savedSection(selection?.sectionId);
    if (!target || !selection.dirty) return;
    if (!isValid(selection)) return setMessage(rangeProblem());
    if (!d.confirm(TEXT.confirmOverwrite)) return;
    const result = saveSection(songId, {
      ...target, startSec: selection.startSec, endSec: selection.endSec, lastLine: null, lastRatio: null,
    }, WHICH);
    if (!result.ok) return setMessage(T.saveFailedOther);
    selection = { ...selection, dirty: false };
    showControls(TEXT.saved);
  }

  function saveCurrent() {
    if (!isValid(selection)) return setMessage(rangeProblem());
    if (selection.sectionId && !selection.dirty) return setMessage(TEXT.saved);
    const section = {
      id: newId(), name: nextSectionName(ytSections()),
      startSec: selection.startSec, endSec: selection.endSec, lastLine: null, lastRatio: null,
    };
    const result = saveSection(songId, section, WHICH);
    if (!result.ok) return setMessage(result.reason === 'max' ? TEXT.max : T.saveFailedOther);
    selection = { ...selection, sectionId: section.id, dirty: false };
    showControls(TEXT.saved); // 新しい区間のボタンを出すため、描きなおす
  }

  // ---------- 画面 ----------
  // プレーヤーの枠はそのままにして、下のボタンだけ描きなおす（描きなおすと動画が読みなおしになるため）
  function showControls(text) {
    if (!controls || !player) return;
    message = note(text);
    position = note('');
    showPosition();
    const items = [
      position, button(T.ytPlay, playHere), button(TEXT.stop, stop),
      button(T.ytSetStart, () => markEdge('start')), button(T.ytSetEnd, () => markEdge('end')),
      note(T.ytRange(edgeText(selection?.startSec ?? null), edgeText(selection?.endSec ?? null))),
      nudgeButtons(), sectionButtons(), button(TEXT.saveSection, saveCurrent), ...actionItems(), message,
    ];
    if (isValid(selection)) items.push(button(T.ytLoop, startLoop)); // 区間が決まったら出す
    items.push(rateRow(), note(T.highCare), safetyList(SAFETY_LINES.slice(0, 3)), button(TEXT.toList, () => go('stage6')));
    controls.replaceChildren(...items);
  }

  load();
  return () => {
    disposed = true;
    abort.abort();
    destroyPlayer();
  };
}
