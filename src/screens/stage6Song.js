// 段6 好きな曲：1曲の練習。区間を選んで「聞く」「歌う」。合いぐあいは「目安」
// 曲のファイル・お手本の線はスマホの中だけ。録った声は保存しない（高さの数字の並びだけ残す）
import { go } from '../router.js';
import { button, heading, note, safetyList } from '../ui/components.js';
import { createPitchGraph } from '../ui/pitchGraph.js';
import { createSongOverview } from '../ui/songOverview.js';
import { createMicSession } from '../ui/practiceLoop.js';
import { openMic } from '../audio/mic.js';
import { createSongPlayer } from '../audio/songPlayer.js';
import { whenSpeakerRestored } from '../audio/tone.js';
import { getFile, isReadFailure } from '../storage/songFiles.js';
import { loadState, getSong, saveSection, addHistory, newId } from '../storage/store.js';
import { toNotes, keyAdvice } from '../logic/songLine.js';
import { notesInSection, scoreSection, lineToGhost } from '../logic/songScore.js';
import { toleranceFor } from '../logic/targets.js';
import { noteLabel } from '../logic/notes.js';
import { CONFIG } from '../logic/config.js';
import { todayString } from '../logic/today.js';
import { STAGE6_TEXT as T, SAFETY_LINES } from '../data/copy.js';

const defaultDeps = { openMic, createSongPlayer, getFile, whenSpeakerRestored };

const TEXT = {
  keyAdvice: (n) => `この 曲は、カラオケの キーを ${n}つ（半音 ${n}つ）下げると 楽に なりそう です（目安）。`,
  octaveNote: 'お手本より 1オクターブ 下・上で 歌っても 大丈夫です',
  lineNote: 'お手本の 線は 目安です。線を 指で なぞって、練習する 区間を 選びます',
  pickFirst: '先に 線を なぞって 区間を 選んで ください',
  saveSection: '区間を 保存',
  saved: '区間を 保存しました',
  max: `保存できる 区間は ${CONFIG.stage6.maxSections}つ までです`,
  listen: '▶ 聞く',
  stop: '■ 止める',
  sing: '● 歌う',
  rate: '速さ',
  source: '聞く音',
  earphone: 'イヤホンを つけましたか？',
  earphoneWhy: 'イヤホンが ないと、マイクが 曲の 音を ひろって しまいます。片方の 耳だけ つけると、自分の 声が 聞きとりやすい ことも あります。',
  volume: '音量は 小さめに して、自分の 声も 聞こえる くらいに しましょう',
  wearing: 'つけた',
  cancel: 'やめる',
  singing: '曲に 合わせて 歌って ください',
  cantPlay: '曲を 流せませんでした。もう一度 押して みてください',
  ratio: (pct) => `いまの 合いぐあい：${pct}%（目安）`,
  previous: (pct) => `前回：${pct}%（目安。その日の 声の 調子で かわります）`,
  noModel: 'この 区間には お手本の 声が ありません',
  noScore: 'この 区間では、判定できる 音が ありませんでした。区間を 少し 長めに 選んで みて ください',
  nudgeStartEarlier: '始まりを 0.5秒 前へ',
  nudgeStartLater: '始まりを 0.5秒 後ろへ',
  nudgeEndEarlier: '終わりを 0.5秒 前へ',
  nudgeEndLater: '終わりを 0.5秒 後ろへ',
  overCare: '高い 所は 無理に のばさないで ください',
  again: 'もう一度 歌う',
  back: 'もどる',
  finish: 'おわる',
  toList: '曲の 一覧へ',
  stopped: 'マイクが 止まりました。',
};

const RATE_LABEL = (r) => `${r}倍`;
const SOURCE_LABEL = { file: '原曲', vocal: '歌声だけ' };
const VERDICT_TEXT = { ok: '合って いた', high: '少し 高め（少し 下げて みよう）', low: '少し 低め（少し 上げて みよう）', none: '声が 聞こえませんでした' };
const noop = () => {};
const percent = (ratio) => Math.round(ratio * 100);
const DEFAULT_WINDOW_MS = 6000; // 線グラフのふつうの窓（pitchGraph.js と同じ）
const sectionMsOf = (section) => (section.endSec - section.startSec) * 1000;

// まだ使っていない一番小さい番号で「区間○」と名づける
function nextSectionName(sections) {
  const used = new Set(sections.map((c) => c.name));
  let n = 1;
  while (used.has(`区間${n}`)) n += 1;
  return `区間${n}`;
}

// 選べるボタンの並び。押したものだけ aria-pressed="true"（見た目は styles.css）
function choiceRow(label, options, current, onPick) {
  const row = document.createElement('div');
  row.className = 'choices';
  row.append(note(label));
  const buttons = options.map(({ value, text }) => {
    const b = button(text, () => {
      buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onPick(value);
    });
    b.setAttribute('aria-pressed', String(value === current));
    return b;
  });
  row.append(...buttons);
  return row;
}

export function renderStage6Song(root, params, deps = defaultDeps) {
  const d = { ...defaultDeps, ...deps };
  const songId = params?.get?.('id') ?? null;
  const state = loadState();
  const range = state.range; // 声の地図。無ければ「高すぎる音」の印は出さない
  const tolerance = toleranceFor(state.levels.s5); // 帯の太さは段5のレベルに合わせる
  let song = null;
  let notes = []; // 曲全体のお手本の音（曲の始まりからの ms）
  let advice = 0; // キーを下げる目安。いまの声の地図で毎回計算しなおす（地図を測りなおしたときのため）
  let player = null;
  let overview = null;
  let message = null; // いまの画面の案内の文（無い画面もある）
  let selection = null; // { startSec, endSec, sectionId }。保存していない区間は sectionId が null
  let rate = 1;
  let source = 'file';
  const available = { file: false, vocal: false }; // 見つかったファイル。聞く音はある方だけ選べる
  let runId = 0; // 聞く・歌うを始めるたびに増やす。古い再生の続きを止める印
  let cancelSing = null;
  const scores = []; // 回ごとの合いぐあい（0〜1）
  let tries = 0;
  let successes = 0;
  let saved = false;
  let disposed = false;

  const title = () => heading(song ? song.title : T.title);
  const setMessage = (text) => { if (message) message.textContent = text; };
  const savedSection = (id) => (id ? getSong(songId)?.sections.find((c) => c.id === id) ?? null : null);

  // ---------- 記録 ----------
  // 今日の分を記録する（二重に書かない）。合いぐあいを測れた回が 0 なら残さない
  function save() {
    if (saved || tries === 0) return;
    saved = true;
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    addHistory({
      date: todayString(), stage: 6, tries, successes, value: Math.round(average * 100) / 100, songTitle: song.title,
    });
  }

  function stopEverything() {
    runId += 1;
    if (cancelSing) cancelSing();
    player?.stop();
  }

  function finishSession() {
    stopEverything();
    save();
    go('stage6');
  }

  const session = createMicSession({
    openMic: (...args) => d.openMic(...args),
    root,
    onReady: (mic) => startSinging(mic),
    onHidden: showStopped,
  });

  // ---------- 読み込み ----------
  // 曲・お手本の線・ファイルがそろわないとき（バックアップから戻した別のスマホなど）は選びなおしを促す
  // 読めなかっただけ（iPhone でつながりが切れたなど）のときは、ファイルはあるかもしれないので選びなおしを促さない
  async function load() {
    song = getSong(songId);
    if (!song) return showMissing();
    const [line, fileRead, vocalRead] = await Promise.all([
      d.getFile(song.id, 'line'),
      song.hasFile ? d.getFile(song.id, 'file') : null,
      song.hasVocal ? d.getFile(song.id, 'vocal') : null,
    ]);
    if (disposed) return;
    const usable = (v) => (isReadFailure(v) ? null : v);
    const fileBlob = usable(fileRead);
    const vocalBlob = usable(vocalRead);
    const someFailed = [line, fileRead, vocalRead].some(isReadFailure);
    if (isReadFailure(line) || (someFailed && !fileBlob && !vocalBlob)) return showReadFailed();
    if (!line || (!fileBlob && !vocalBlob)) return showMissing();
    notes = toNotes(line);
    advice = keyAdvice(notes, range);
    available.file = Boolean(fileBlob);
    available.vocal = Boolean(vocalBlob);
    source = available.file ? 'file' : 'vocal';
    player = d.createSongPlayer({ fileBlob, vocalBlob });
    player.onTime((sec) => overview?.setPlayhead(sec));
    const first = song.sections[0];
    if (first) selection = { startSec: first.startSec, endSec: first.endSec, sectionId: first.id };
    showMain('');
  }

  // 曲の記録があれば、一覧の「ファイルを 選びなおす」へ直接つなぐ
  function showMissing() {
    const items = [title(), note(T.refile)];
    if (song) items.push(button(T.refileButton, () => go('stage6', { refile: song.id })));
    items.push(button(TEXT.toList, () => go('stage6')));
    root.replaceChildren(...items);
  }

  function showReadFailed() {
    root.replaceChildren(
      title(), note(T.readFailed),
      button(T.retry, () => { root.replaceChildren(title()); load(); }),
      button(TEXT.toList, () => go('stage6')),
    );
  }

  function showStopped() {
    stopEverything();
    message = null;
    root.replaceChildren(title(), note(TEXT.stopped), button(TEXT.back, () => showMain('')));
  }

  // ---------- 区間を選ぶ・聞く ----------
  function select(startSec, endSec, sectionId) {
    stopEverything();
    selection = { startSec, endSec, sectionId };
    overview?.setSelection(startSec, endSec);
    setMessage('');
  }

  // 区間の端を nudgeSec ずつ動かす（指でなぞるだけでは細かく合わせにくいため）。
  // 曲の外には出さず、区間が nudgeSec より短くなる・入れかわるときは動かさない
  const clampSec = (sec) => Math.min(song.durationSec, Math.max(0, Math.round(sec * 1000) / 1000));
  function nudge(edge, delta) {
    if (!selection) return setMessage(TEXT.pickFirst);
    let { startSec, endSec } = selection;
    if (edge === 'start') startSec = clampSec(startSec + delta);
    else endSec = clampSec(endSec + delta);
    if (!(startSec < endSec - CONFIG.stage6.nudgeSec)) return;
    select(startSec, endSec, null); // 動かした区間は、保存していない区間になる（「区間を 保存」で残せる）
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
    for (const c of getSong(songId)?.sections ?? []) {
      box.append(button(c.name, () => select(c.startSec, c.endSec, c.id)));
    }
    return box;
  }

  function saveCurrent() {
    if (!selection) return setMessage(TEXT.pickFirst);
    if (selection.sectionId) return setMessage(TEXT.saved);
    const sections = getSong(songId)?.sections ?? [];
    const section = {
      id: newId(), name: nextSectionName(sections),
      startSec: selection.startSec, endSec: selection.endSec, lastLine: null, lastRatio: null,
    };
    const result = saveSection(songId, section);
    if (!result.ok) return setMessage(result.reason === 'max' ? TEXT.max : T.saveFailedOther);
    selection = { ...selection, sectionId: section.id };
    showMain(TEXT.saved); // 新しい区間のボタンを出すため、描きなおす
  }

  // 区間をくり返し流す。聞くだけなので、下のスピーカーを借りて大きく鳴らす
  function listen() {
    if (!selection) return setMessage(TEXT.pickFirst);
    stopEverything();
    const myRun = runId;
    player.play({ fromSec: selection.startSec, toSec: selection.endSec, rate, source, loop: true, speaker: true })
      .catch(() => { if (myRun === runId && !disposed) setMessage(TEXT.cantPlay); });
  }

  // 速さ・聞く音を変えたら、いまの再生は止める（次に「聞く」を押すと新しい設定で流す）
  function changeSetting(apply) {
    apply();
    stopEverything();
  }

  function settingRows() {
    const rates = CONFIG.stage6.rates.map((r) => ({ value: r, text: RATE_LABEL(r) }));
    const sources = ['file', 'vocal'].filter((s) => available[s]).map((s) => ({ value: s, text: SOURCE_LABEL[s] }));
    return [
      choiceRow(TEXT.rate, rates, rate, (v) => changeSetting(() => { rate = v; })),
      choiceRow(TEXT.source, sources, source, (v) => changeSetting(() => { source = v; })),
    ];
  }

  function showMain(text) {
    stopEverything();
    message = note(text);
    const canvas = document.createElement('canvas');
    overview = createSongOverview(canvas, {
      notes, durationSec: song.durationSec, onSelect: (a, b) => select(a, b, null),
    });
    if (selection) overview.setSelection(selection.startSec, selection.endSec);
    const items = [title()];
    if (advice > 0) items.push(note(TEXT.keyAdvice(advice)));
    items.push(
      note(TEXT.lineNote), note(TEXT.octaveNote), canvas, nudgeButtons(), sectionButtons(),
      button(TEXT.saveSection, saveCurrent), message,
      button(TEXT.listen, listen), button(TEXT.stop, stopEverything), button(TEXT.sing, askEarphone),
      ...settingRows(), note(T.highCare), safetyList(SAFETY_LINES.slice(0, 3)), button(TEXT.finish, finishSession),
    );
    root.replaceChildren(...items);
  }

  // ---------- 歌う ----------
  // イヤホンが無いとマイクが曲を拾うので、毎回たずねる。「つけた」まで始めない
  function askEarphone() {
    if (!selection) return setMessage(TEXT.pickFirst);
    stopEverything();
    message = null;
    root.replaceChildren(
      title(), note(TEXT.earphone), note(TEXT.earphoneWhy), note(TEXT.volume),
      button(TEXT.wearing, () => (session.mic ? startSinging(session.mic) : session.open())),
      button(TEXT.cancel, () => showMain('')),
    );
  }

  // 区間の帯。声の地図の上（high）を超える音は over にして色を変える
  function bandsFor(sectionNotes) {
    return sectionNotes.map((n) => ({
      midi: n.midi, cents: tolerance, startMs: n.startMs, endMs: n.endMs, over: range ? n.midi > range.high : false,
    }));
  }

  // 線グラフの上下の範囲。区間の音（無ければ声の地図）から少し余白をとる
  function graphRange(sectionNotes) {
    const r = range ?? CONFIG.defaultRange;
    const midis = sectionNotes.length ? sectionNotes.map((n) => n.midi) : [r.low, r.high];
    return { minMidi: Math.min(...midis) - 4, maxMidi: Math.max(...midis) + 4 };
  }

  async function startSinging(mic) {
    stopEverything();
    const myRun = runId;
    // 「聞く」で下のスピーカーを借りていたら、マイク用の出し方（play-and-record）に戻ってから流す。
    // 戻る前に流すと、歌う間の曲がスピーカーから鳴り、マイクが曲を拾うため
    await d.whenSpeakerRestored();
    if (myRun !== runId || disposed) return;
    const section = { ...selection };
    const sectionNotes = notesInSection(notes, section.startSec, section.endSec);
    const previous = savedSection(section.sectionId);
    const canvas = document.createElement('canvas');
    // 長い区間でも、歌い終わったとき区間ぜんぶ（前奏から）と前回の線が見えるよう、窓を区間の長さに合わせる
    const windowMs = Math.max(DEFAULT_WINDOW_MS, sectionMsOf(section) + CONFIG.stage6.leadInSec * 1000);
    const graph = createPitchGraph(canvas, { ...graphRange(sectionNotes), windowMs });
    const bands = bandsFor(sectionNotes);
    graph.setBands(bands);
    if (previous?.lastLine) graph.setGhost(previous.lastLine); // 前回の自分の線を薄く重ねる
    message = null;
    root.replaceChildren(title(), note(TEXT.singing), canvas, button(TEXT.stop, () => showMain('')));

    const readings = collect(mic, section, graph);
    // 区間の少し前から1回だけ流す。歌う間はスピーカーを借りない（イヤホンで聞く）
    const fromSec = Math.max(0, section.startSec - CONFIG.stage6.leadInSec);
    player.play({ fromSec, toSec: section.endSec, rate, source, loop: false, speaker: false }).then(
      () => { if (myRun === runId && !disposed) endSinging({ section, sectionNotes, bands, previous, readings, canvas, graph }); },
      () => { if (myRun === runId && !disposed) showMain(TEXT.cantPlay); },
    );
  }

  // マイクの遅れは本当の時間。曲の位置に直すと、ゆっくり流したぶん短くなる
  const latencyInSongMs = () => CONFIG.stage6.latencyMs * rate;

  // マイクの読みを集める。時刻は曲の位置（区間の始まりから ms）で測る。
  // 曲の位置で測るので、ゆっくり流しても帯・前回の線と同じ時間の目盛りになる。
  // 声はマイクの遅れのぶん遅れて届くので、その分を引いた時刻で描き・残す（判定と同じ時刻。線が右にずれないように）
  function collect(mic, section, graph) {
    const readings = [];
    const sectionMs = sectionMsOf(section);
    const latencyMs = latencyInSongMs();
    cancelSing = () => { mic.onFrame(noop); cancelSing = null; };
    mic.onFrame((midi) => {
      const t = (player.currentSec() - section.startSec) * 1000 - latencyMs;
      if (t < 0) return graph.push(t, null); // 前奏の間は数えない（グラフの時計だけ進める）
      if (t > sectionMs) return;
      readings.push({ t, midi });
      graph.push(t, midi);
    });
    return readings;
  }

  function endSinging(run) {
    if (cancelSing) cancelSing();
    run.graph.push(sectionMsOf(run.section), null); // 時計を区間の終わりまで進め、区間ぜんぶを窓に入れる
    // 読みの時刻は collect でマイクの遅れを引いてあるので、ここでは引かない（0）
    const { ratio, verdicts } = scoreSection(run.readings, run.sectionNotes, tolerance, 0);
    const kept = recordTry(ratio, run);
    showResult(ratio, verdicts, run, kept);
  }

  // 1回分を数え、保存した区間なら今回の線と合いぐあいを残す（声そのものは残さない）。
  // お手本の声が無い区間は測れないので、前回の線・合いぐあいは書きかえない。残せなかったら false
  function recordTry(ratio, { previous, readings }) {
    if (ratio !== null) {
      tries += 1;
      scores.push(ratio);
      if (ratio >= CONFIG.stage5.passRatio) successes += 1;
    }
    if (!previous || ratio === null) return true;
    return saveSection(songId, { ...previous, lastLine: lineToGhost(readings), lastRatio: ratio }).ok;
  }

  function verdictList(sectionNotes, verdicts) {
    const list = document.createElement('ul');
    sectionNotes.forEach((n, i) => {
      const li = document.createElement('li');
      li.textContent = `${noteLabel(n.midi)}：${VERDICT_TEXT[verdicts[i]]}`;
      list.append(li);
    });
    return list;
  }

  function showResult(ratio, verdicts, { sectionNotes, bands, previous, canvas }, kept) {
    const items = [title(), canvas];
    if (ratio === null) {
      // お手本の音が無い区間と、音はあるが判定できる読みが無かった区間で、案内を分ける
      items.push(note(sectionNotes.length === 0 ? TEXT.noModel : TEXT.noScore));
    } else {
      items.push(note(TEXT.ratio(percent(ratio))));
      if (previous && previous.lastRatio !== null) items.push(note(TEXT.previous(percent(previous.lastRatio))));
      items.push(verdictList(sectionNotes, verdicts));
    }
    if (bands.some((b) => b.over)) items.push(note(TEXT.overCare));
    if (!kept) items.push(note(T.saveFailedOther));
    items.push(button(TEXT.again, askEarphone), button(TEXT.back, () => showMain('')), button(TEXT.finish, finishSession));
    message = null;
    root.replaceChildren(...items);
  }

  root.replaceChildren(title());
  load();
  return () => {
    disposed = true;
    stopEverything();
    session.close();
    player?.dispose();
    save();
  };
}
