// 段6② YouTube で練習：公式の埋め込みプレーヤーで流し、区間をくり返し聞く・合わせて歌う
// 曲はダウンロードしない。YouTube に つながるのは、この画面のプレーヤーだけ。
// 歌う声はスマホの中で高さの数字にするだけ（録った声は残さない。保存するのは高さの数字の並びだけ）
import { go } from '../router.js';
import { button, heading, note, safetyList } from '../ui/components.js';
import { createPitchGraph } from '../ui/pitchGraph.js';
import { createMicSession } from '../ui/practiceLoop.js';
import { openMic } from '../audio/mic.js';
import { loadYouTubeApi, createYtPlayer, ytErrorKey } from '../audio/ytPlayer.js';
import { createSongClock, loopAction } from '../logic/ytClock.js';
import { stabilityOf, outsideRange } from '../logic/stability.js';
import { lineToGhost } from '../logic/songScore.js';
import { loadState, getSong, saveSection, removeSection, addHistory, newId } from '../storage/store.js';
import { CONFIG } from '../logic/config.js';
import { todayString } from '../logic/today.js';
import { STAGE6_TEXT as T, SAFETY_LINES } from '../data/copy.js';
import { TEXT, RATE_LABEL, nextSectionName } from './stage6Song.js';

const defaultDeps = {
  loadYouTubeApi,
  createYtPlayer,
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id),
  now: () => performance.now(), // 歌うときの、再生位置の時計に使う
  confirm: (text) => window.confirm(text),
  openMic,
};

const WHICH = 'ytSections'; // YouTube の区間は、曲ファイルの区間とは別に持つ（時間の基準がちがうことがあるため）

const noop = () => {};
const DEFAULT_WINDOW_MS = 6000; // 線グラフのふつうの窓（pitchGraph.js と同じ）
const sectionMsOf = (section) => (section.endSec - section.startSec) * 1000;
// ゆれの目安 → 結果の文（'none' は別の文にする。声が無いのに「まっすぐ」と言わないため）
const WOBBLE_TEXT = { steady: T.ytSteady, some: T.ytSome, wobbly: T.ytWobbly };

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
  const range = loadState().range; // 声の地図。無ければ地図の線・地図の外の数は出さない
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
  let lastState = null; // プレーヤーの最後の状態（'playing' など）。歌うときの時計に使う
  let take = null; // 歌っている1回分 { section, previous, readings, graph, canvas, clock, mic }。歌っていなければ null
  let tries = 0; // 歌い終えて、声が聞こえた回の数
  let historySaved = false;
  // 「つけた」でマイクを待っている印。待つ間に「やめる」を押したら、開いたマイクで歌い始めない
  let micWanted = false;

  const title = () => heading(song ? song.title : T.title);
  const setMessage = (text) => { if (message) message.textContent = text; };
  const ytSections = () => getSong(songId)?.ytSections ?? [];
  const savedSection = (id) => (id ? ytSections().find((c) => c.id === id) ?? null : null);
  // 動画の長さ。まだ分からない（0）ときは、上の端を決めない
  const durationSec = () => player?.duration() || Infinity;
  const isValid = (s) => s !== null && s.startSec !== null && s.endSec !== null
    && s.startSec >= 0 && s.endSec <= durationSec() && s.startSec < s.endSec - CONFIG.stage6.nudgeSec;

  // ---------- 片づけ ----------
  // 歌っている途中の回をやめる（数えない）。マイクはまた開けるように release で閉じる
  function abandonTake() {
    if (!take) return;
    take.mic.onFrame(noop);
    take = null;
    session.release();
  }

  // 今日の分を記録する（二重に書かない）。歌い終えた回が 0 なら残さない
  function saveHistory() {
    if (historySaved || tries === 0) return;
    historySaved = true;
    addHistory({ date: todayString(), stage: 6, tries, successes: 0, value: null, songTitle: song.title, kind: 'yt' });
  }

  function stopPoll() {
    if (pollId !== null) d.clearInterval(pollId);
    pollId = null;
    looping = false;
  }

  // 二重に呼ばれても1回だけ destroy する
  function destroyPlayer() {
    abandonTake();
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
    lastState = name;
    if (disposed || !player) return;
    if (take) return onSingState(name); // 歌っている間は、歌う側のタイマーにまかせる
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
    if (isValid(selection)) items.push(button(T.ytLoop, startLoop), button(TEXT.sing, askEarphone)); // 区間が決まったら出す
    items.push(rateRow());
    // 曲のファイルもある曲は、お手本の線のある練習の画面へ行ける
    if (song.hasFile || song.hasVocal) items.push(button(T.ytToSong, () => go('song', { id: songId })));
    items.push(note(T.highCare), safetyList(SAFETY_LINES.slice(0, 3)), button(TEXT.toList, () => go('stage6')));
    controls.replaceChildren(...items);
  }

  // ---------- 歌う ----------
  // マイクは歌うときだけ開き、歌い終わったら閉じる（開いたままだと、YouTube の音が小さくなることがあるため）
  const session = createMicSession({
    openMic: (...args) => d.openMic(...args),
    root,
    onReady: (mic) => startSinging(mic),
    onHidden: showStopped,
  });

  // イヤホンが無いとマイクが曲を拾うので、毎回たずねる。「つけた」まで始めない（文は段6①と同じ）
  function askEarphone() {
    if (!player) return;
    if (!isValid(selection)) return setMessage(rangeProblem());
    stop();
    message = null;
    controls.replaceChildren(
      note(TEXT.earphone), note(TEXT.earphoneWhy), note(TEXT.volume),
      button(TEXT.wearing, () => {
        micWanted = true;
        if (session.mic) startSinging(session.mic);
        else session.open();
      }),
      button(TEXT.cancel, () => { micWanted = false; showControls(''); }),
    );
  }

  // 線グラフの上下の範囲。声の地図（無ければふつうの範囲）から少し余白をとる
  function graphRange() {
    const r = range ?? CONFIG.defaultRange;
    return { minMidi: r.low - 4, maxMidi: r.high + 4 };
  }

  function startSinging(mic) {
    // マイクが開くのを待つ間に、離れた・エラーになった・区間が消えたときは歌わない
    const wanted = micWanted;
    micWanted = false;
    if (!wanted || disposed || !player || !isValid(selection)) return session.release();
    stopPoll();
    const section = { ...selection };
    const previous = section.dirty ? null : savedSection(section.sectionId); // 範囲を動かしたあとは前回の線と合わない
    const canvas = document.createElement('canvas');
    // 長い区間でも、歌い終わったとき区間ぜんぶ（前奏から）と前回の線が見えるよう、窓を区間の長さに合わせる
    const windowMs = Math.max(DEFAULT_WINDOW_MS, sectionMsOf(section) + CONFIG.stage6.leadInSec * 1000);
    const graph = createPitchGraph(canvas, { ...graphRange(), windowMs });
    graph.setRangeLines(range?.low ?? null, range?.high ?? null);
    if (previous?.lastLine) graph.setGhost(previous.lastLine); // 前回の自分の線を薄く重ねる
    message = null;
    controls.replaceChildren(note(TEXT.singing), canvas, button(TEXT.stop, cancelTake));
    const seekSec = Math.max(0, section.startSec - CONFIG.stage6.leadInSec);
    // landed：seekTo の先に位置が届いた印。playedAfterSeek：seekTo のあとに playing が来た印。waitedPolls：届くまで待った回数
    take = {
      section, previous, readings: [], graph, canvas, clock: createSongClock(), mic,
      seekSec, landed: false, playedAfterSeek: false, waitedPolls: 0,
    };
    mic.onFrame((midi) => onSingFrame(midi));
    // 区間の少し前から1回だけ流す
    player.seekTo(seekSec);
    player.play();
    pollId = d.setInterval(singTick, CONFIG.stage6.yt.pollMs);
  }

  // pollMs ごとに再生位置を読んで時計を合わせ、区間の終わりに来たら止める（1回だけ流す）
  function singTick() {
    if (!take || !player) return;
    const nowMs = d.now();
    const readSec = player.currentSec();
    if (!take.landed && !checkLanded(readSec)) return;
    take.clock.update(readSec, nowMs, lastState === 'playing', rate);
    const { startSec, endSec } = take.section;
    if (loopAction(take.clock.estimate(nowMs), startSec, endSec, false) === 'stop') endTake();
  }

  // YouTube は seekTo のすぐあと、しばらく古い位置を返すことがある。古い位置が区間の終わりより後ろだと
  // すぐ「終わり」になり、区間の中ほどだと時刻がずれる。位置が seekTo の先に届くまでは、時計も終わりも見ない。
  // いつまでも届かない（seekWaitMs）ときは、待つのをやめて、声の無い回として終える
  function checkLanded(readSec) {
    const { seekSec, section } = take;
    const near = readSec >= seekSec - 0.5 && readSec < section.endSec;
    if (near || (take.playedAfterSeek && readSec < section.endSec)) {
      take.landed = true;
      return true;
    }
    take.waitedPolls += 1;
    if (take.waitedPolls * CONFIG.stage6.yt.pollMs >= CONFIG.stage6.yt.seekWaitMs) endTake();
    return false;
  }

  // 歌っている間のプレーヤーの状態。位置が届く前の状態の変化（seekTo の途中）は見ない。
  // 区間の終わりが動画の終わりと同じだと、位置が少し手前のまま ended になるので、そこで終える。
  // 一時停止（YouTube の画面のボタンなど）したら、時刻がずれるので今回は数えない
  function onSingState(name) {
    if (name === 'playing') take.playedAfterSeek = true;
    if (!take.landed) return;
    if (name === 'ended') endTake();
    else if (name === 'paused') interruptTake();
  }

  function interruptTake() {
    abandonTake();
    stopPoll();
    showControls(T.ytPausedTake);
  }

  // マイクの1コマ。時刻は曲の位置（区間の始まりから ms）で測る。ゆっくり流しても前回の線と同じ目盛りになる。
  // 声はマイクの遅れのぶん遅れて届くので、その分を引く（遅れは本当の時間なので、曲の位置では速さをかける）
  function onSingFrame(midi) {
    if (!take?.landed) return; // 位置が届くまでは、曲のどこなのか分からない
    const songSec = take.clock.estimate(d.now());
    const t = (songSec - take.section.startSec) * 1000 - CONFIG.stage6.latencyMs * rate;
    if (t < 0) return take.graph.push(t, null); // 前奏の間は数えない（グラフの時計だけ進める）
    if (t > sectionMsOf(take.section)) return;
    take.readings.push({ t, midi });
    take.graph.push(t, midi);
  }

  // 途中でやめる（「止める」）：数えずに、区間の画面へ戻る
  function cancelTake() {
    abandonTake();
    stopPoll();
    player?.pause();
    showControls('');
  }

  // 区間の終わりまで歌えたとき：止めて、マイクを閉じて、結果を出す
  function endTake() {
    const run = take;
    if (!run) return;
    abandonTake();
    stopPoll();
    player?.pause();
    run.graph.push(sectionMsOf(run.section), null); // 時計を区間の終わりまで進め、区間ぜんぶを窓に入れる
    const wobble = stabilityOf(run.readings);
    const kept = recordTake(wobble, run);
    showTakeResult(wobble, outsideRange(run.readings, range), run, kept);
  }

  // 声が聞こえた回だけ数え、保存した区間なら今回の線を残す（声そのものは残さない）。
  // 合いぐあいの数字は YouTube では出さないので、lastRatio は null のまま。残せなかったら false
  function recordTake(wobble, { previous, readings }) {
    if (wobble.label === 'none') return true; // 声が無い回は数えず、前回の線も書きかえない
    tries += 1;
    if (!previous) return true;
    return saveSection(songId, { ...previous, lastLine: lineToGhost(readings), lastRatio: null }, WHICH).ok;
  }

  function showTakeResult(wobble, outside, { canvas }, kept) {
    const items = [canvas];
    if (wobble.label === 'none') items.push(note(T.ytNoVoice));
    else items.push(note(WOBBLE_TEXT[wobble.label]), note(T.ytWobbleNote));
    if (outside.above + outside.below > 0) items.push(note(T.ytOutside(outside.above, outside.below)), note(TEXT.overCare));
    if (!kept) items.push(note(T.saveFailedOther));
    items.push(button(TEXT.again, askEarphone), button(TEXT.back, () => showControls('')), button(TEXT.finish, () => go('stage6')));
    message = null;
    controls.replaceChildren(...items);
  }

  // アプリを隠してマイクが止まったとき：途中の回は数えず、プレーヤーも止める
  function showStopped() {
    take?.mic.onFrame(noop);
    take = null;
    stopPoll();
    player?.pause();
    message = null;
    controls.replaceChildren(note(TEXT.stopped), button(TEXT.again, askEarphone), button(TEXT.back, () => showControls('')));
  }

  load();
  return () => {
    disposed = true;
    abort.abort();
    destroyPlayer(); // 歌っている途中の回もここでやめる（数えない）
    session.close();
    saveHistory();
  };
}
