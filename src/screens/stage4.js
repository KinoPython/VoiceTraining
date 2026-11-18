// 段4 1音合わせ：お手本の音を聞いて、同じ高さで声を出す（1オクターブちがいでも合格）
import { go } from '../router.js';
import { button, heading, note } from '../ui/components.js';
import { createPitchGraph } from '../ui/pitchGraph.js';
import { createMicSession, runTry } from '../ui/practiceLoop.js';
import { openMic } from '../audio/mic.js';
import { playNote, stopAll, borrowSpeaker } from '../audio/tone.js';
import { createHoldJudge } from '../logic/hold.js';
import { matchTarget, toleranceFor } from '../logic/targets.js';
import { createLadder } from '../logic/ladder.js';
import { noteLabel } from '../logic/notes.js';
import { CONFIG } from '../logic/config.js';
import { todayString } from '../logic/today.js';
import { loadState, setLevel, addHistory } from '../storage/store.js';
import { MAP_FIRST_HINT } from '../data/copy.js';
import { tipNote } from '../ui/tipNote.js';

const defaultDeps = {
  openMic,
  playNote,
  stopAll,
  borrowSpeaker,
  // お手本のあとの「待ち」。この間は判定しない
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  rand: Math.random,
  createAudio: (url) => new Audio(url),
};

const TEXT = {
  intro: 'お手本の 音を 聞いて、同じ 高さで『んー』か『あー』と 声を 出す 練習です。マイクを 使います',
  guide: 'お手本を 聞いて、同じ 高さで『んー』か『あー』',
  listening: 'お手本を 聞いて います…',
  waiting: '少し 待って…',
  go: '声を 出して ください',
  ok: 'できた！',
  up: '1つ 上の 高さで 合って いました',
  down: '1つ 下の 高さで 合って いました',
  close: 'おしい！',
  high: '少し 高めでした',
  low: '少し 低めでした',
  silent: '声が 聞こえませんでした。もう少し 大きめの 声で ためして みましょう',
  stopped: 'マイクが 止まりました。',
};

// 時間切れのときの一言（おしい！＋最後の向き）
function missText(direction) {
  if (direction === 'high') return `${TEXT.close} ${TEXT.high}`;
  if (direction === 'low') return `${TEXT.close} ${TEXT.low}`;
  return `${TEXT.close} ${TEXT.silent}`;
}

export function renderStage4(root, params, deps = defaultDeps) {
  const d = { ...defaultDeps, ...deps };
  const state = loadState();
  const hasRange = state.range !== null;
  const range = state.range ?? CONFIG.defaultRange;
  const ladder = createLadder({ level: state.levels.s4 });
  let tries = 0;
  let successes = 0;
  let saved = false;
  let disposed = false;
  let ended = false; // 「おわる」を押した後。途中の1回は数えない
  let toneId = 0; // 鳴らすたびに増やす。古い音の「終わり」を無視する
  let activeTry = null;
  let takeUrl = null; // 直前の録音。次の回・離れるときに捨てる
  let audio = null;
  let giveBackSpeaker = null; // 聞き直しで借りたスピーカーを返す関数

  const title = () => heading('1音 合わせ');

  function stopOwnVoice() {
    const current = audio;
    audio = null;
    if (current) current.pause();
    releaseSpeaker();
  }

  // 借りたスピーカーを返す
  function releaseSpeaker() {
    const give = giveBackSpeaker;
    giveBackSpeaker = null;
    if (give) give();
  }

  // 録音の URL を捨てる（メモリに残さない）
  function dropTake() {
    stopOwnVoice();
    if (takeUrl) URL.revokeObjectURL(takeUrl);
    takeUrl = null;
  }

  // 今日の分を記録する（二重に書かない）。試した回数が 0 なら履歴は残さない
  function save() {
    if (saved) return;
    saved = true;
    setLevel('s4', ladder.level);
    if (tries > 0) addHistory({ date: todayString(), stage: 4, tries, successes, value: null });
  }

  function finishSession() {
    ended = true;
    if (activeTry) activeTry.cancel();
    save();
    go('home');
  }

  const session = createMicSession({
    openMic: (...args) => d.openMic(...args),
    root,
    onReady: () => showTry(),
    onHidden: showStopped,
  });

  function showIntro() {
    const items = [title()];
    if (!hasRange) {
      items.push(note(MAP_FIRST_HINT), button('声の 地図へ', () => go('stage2')));
    }
    items.push(note(TEXT.intro), button('マイクを ひらく', () => session.open()));
    root.replaceChildren(...items);
  }

  function showStopped() {
    if (activeTry) activeTry.cancel();
    d.stopAll();
    dropTake();
    root.replaceChildren(title(), note(TEXT.stopped), button('もう一度 マイクを ひらく', () => session.open()));
  }

  function showTry() {
    // 前の音・前の録音が残っていると誤判定や聞きまちがいのもとなので片づける
    toneId += 1;
    d.stopAll();
    dropTake();
    const mic = session.mic;
    const targetMidi = matchTarget(ladder.level, tries, range, d.rand);
    const tolerance = toleranceFor(ladder.level);
    const canvas = document.createElement('canvas');
    const graph = createPitchGraph(canvas, { minMidi: targetMidi - CONFIG.stage3.graphSpan, maxMidi: targetMidi + CONFIG.stage3.graphSpan });
    graph.setBands([{ midi: targetMidi, cents: tolerance }]);

    const status = note(TEXT.guide);
    const detail = note(''); // 「1つ 上の 高さで…」など
    const replayBox = document.createElement('div');
    let busy = false; // お手本・判定・聞き直しの最中

    const startBtn = button('はじめる', begin);
    const endBtn = button('おわる', finishSession);

    // お手本を鳴らす。鳴らせなくても練習は続ける。古い音の終わりや離脱後は false
    async function playTarget() {
      const myTone = ++toneId;
      try {
        await d.playNote(targetMidi, CONFIG.stage4.toneMs);
      } catch {
        // 鳴らせなくても続けられる
      }
      return myTone === toneId && !disposed && !ended;
    }

    async function playOwn() {
      if (!takeUrl) return;
      stopOwnVoice();
      const mine = d.createAudio(takeUrl);
      audio = mine;
      // 聞き直しの音も下のスピーカーから。終わり・止めた・失敗のどれでも返す
      const give = d.borrowSpeaker(); // 返す関数は何度呼んでも1回分だけ
      giveBackSpeaker = give;
      mine.onended = give;
      mine.onpause = give;
      try {
        await mine.play();
      } catch {
        give(); // 再生できなくても練習は続けられる
      }
    }

    async function replay(kind) {
      if (busy) return;
      busy = true;
      d.stopAll();
      stopOwnVoice();
      const alive = kind === 'own' ? true : await playTarget();
      if (alive && kind !== 'target') await playOwn();
      busy = false;
    }

    function showReplay(hasTake) {
      const buttons = [button('お手本', () => replay('target'))];
      if (hasTake) {
        buttons.push(button('自分の 声', () => replay('own')), button('続けて 聞く', () => replay('both')));
      }
      replayBox.replaceChildren(...buttons);
    }

    async function begin() {
      if (busy) return;
      busy = true;
      startBtn.disabled = true;
      graph.clear();
      status.textContent = TEXT.listening;
      // お手本の間と、そのあとの待ちは判定しない（お手本を自分の声と取りちがえないため）
      if (!(await playTarget())) return;
      status.textContent = TEXT.waiting;
      await d.wait(CONFIG.stage4.waitMs);
      if (ended || disposed || session.mic !== mic) return;
      status.textContent = `${noteLabel(targetMidi)} に 合わせましょう。${TEXT.go}`;
      // 判定と録音は同じ瞬間に始める
      mic.startTake();
      activeTry = runTry({
        mic,
        graph,
        judge: createHoldJudge({ targetMidi, toleranceCents: tolerance, allowOctave: true }),
        tryMs: CONFIG.stage4.tryMs,
      });
      const result = await activeTry.promise;
      activeTry = null;
      const url = await mic.stopTake();
      if (ended || disposed || session.mic !== mic) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      takeUrl = url;
      busy = false;
      showResult(result, graph);
    }

    function showResult(result, graphNow) {
      tries += 1;
      if (result.done) successes += 1;
      ladder.answer(result.done);
      graphNow.setOk(result.done);
      status.textContent = result.done ? TEXT.ok : missText(result.lastDirection);
      detail.textContent = result.done && result.octaveShift >= 1 ? TEXT.up : result.done && result.octaveShift <= -1 ? TEXT.down : '';
      showReplay(takeUrl !== null);
      startBtn.replaceWith(button('つぎへ', showTry));
    }

    root.replaceChildren(
      title(),
      note(`レベル ${ladder.level}`),
      status,
      detail,
      canvas,
      replayBox,
      startBtn,
      endBtn,
      ...tipNote('s4', tries),
    );
  }

  showIntro();
  return () => {
    disposed = true;
    if (activeTry) activeTry.cancel();
    d.stopAll();
    dropTake();
    session.close();
    if (tries > 0) save();
  };
}
