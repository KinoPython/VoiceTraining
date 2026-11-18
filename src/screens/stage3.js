// 段3 すべらせて止める：声をゆっくり動かして、目標の帯の中で止める
import { go } from '../router.js';
import { button, heading, note } from '../ui/components.js';
import { createPitchGraph } from '../ui/pitchGraph.js';
import { createMicSession, runTry } from '../ui/practiceLoop.js';
import { openMic } from '../audio/mic.js';
import { playNote, stopAll } from '../audio/tone.js';
import { createHoldJudge } from '../logic/hold.js';
import { glideTarget, toleranceFor } from '../logic/targets.js';
import { createLadder } from '../logic/ladder.js';
import { noteLabel } from '../logic/notes.js';
import { CONFIG } from '../logic/config.js';
import { todayString } from '../logic/today.js';
import { loadState, setLevel, addHistory } from '../storage/store.js';
import { MAP_FIRST_HINT } from '../data/copy.js';
import tips from '../data/tips.json';

const defaultDeps = { openMic, playNote, stopAll };

const TONE_MS = 1000; // 目標の音を鳴らす長さ
const GRAPH_SPAN = 7; // 目標の上下に見せる半音の数

const TEXT = {
  intro: '声を ゆっくり 動かして、目標の 帯の 中で 止める 練習です。マイクを 使います',
  below: '帯より 下から『うー』と ゆっくり 上げて、帯の 中で 止めて ください',
  above: '帯より 上から ゆっくり 下げて',
  high: '少し 高め ↓',
  low: '少し 低め ↑',
  ok: 'できた！',
  close: 'おしい！ もう一度 ためして みましょう',
  stopped: 'マイクが 止まりました。',
};

export function renderStage3(root, params, deps = defaultDeps) {
  const state = loadState();
  const hasRange = state.range !== null;
  const range = state.range ?? CONFIG.defaultRange;
  const ladder = createLadder({ level: state.levels.s3 });
  let tries = 0;
  let successes = 0;
  let saved = false;
  let disposed = false;
  let ended = false; // 「おわる」を押した後。途中の1回は数えない
  let toneId = 0; // 鳴らすたびに増やす。古い音の「終わり」を無視する
  let activeTry = null;

  const title = () => heading('すべらせて 止める');

  // 今日の分を記録する（二重に書かない）。試した回数が 0 なら履歴は残さない
  function save() {
    if (saved) return;
    saved = true;
    setLevel('s3', ladder.level);
    if (tries > 0) addHistory({ date: todayString(), stage: 3, tries, successes, value: null });
  }

  function finishSession() {
    ended = true;
    if (activeTry) activeTry.cancel();
    save();
    go('home');
  }

  const session = createMicSession({
    openMic: (...args) => deps.openMic(...args),
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
    deps.stopAll();
    root.replaceChildren(title(), note(TEXT.stopped), button('もう一度 マイクを ひらく', () => session.open()));
  }

  // 段のコツを1つ（tips.s3 が空なら出さない）
  function tipNote() {
    const list = tips.s3 ?? [];
    return list.length ? [note(list[tries % list.length])] : [];
  }

  function showTry() {
    const mic = session.mic;
    const { targetMidi, startFrom } = glideTarget(ladder.level, tries, range);
    const tolerance = toleranceFor(ladder.level);
    const canvas = document.createElement('canvas');
    const graph = createPitchGraph(canvas, { minMidi: targetMidi - GRAPH_SPAN, maxMidi: targetMidi + GRAPH_SPAN });
    graph.setBands([{ midi: targetMidi, cents: tolerance }]);

    const hint = note(''); // 帯の外にいるときの「少し 高め」など
    const status = note(startFrom === 'below' ? TEXT.below : TEXT.above);
    let toneOn = false;
    let trying = false;

    const listenBtn = button('▶ 目標の 音を 聞く', listen);
    const startBtn = button('はじめる', begin);
    const endBtn = button('おわる', finishSession);

    function refreshButtons() {
      listenBtn.disabled = trying || toneOn; // 試している間と、音が鳴っている間は押せない
      startBtn.disabled = toneOn || trying; // 音が鳴っている間は始められない（判定に混ざらないように）
    }

    async function listen() {
      if (trying || toneOn) return;
      const myTone = ++toneId;
      toneOn = true;
      refreshButtons();
      try {
        await deps.playNote(targetMidi, TONE_MS);
      } catch {
        // 鳴らせなくても練習は続けられる
      }
      if (myTone !== toneId || disposed) return;
      toneOn = false;
      refreshButtons();
    }

    function showHint(result) {
      hint.textContent = result.direction === 'high' ? TEXT.high : result.direction === 'low' ? TEXT.low : '';
    }

    async function begin() {
      if (trying || toneOn) return;
      trying = true;
      refreshButtons();
      graph.clear();
      status.textContent = `${noteLabel(targetMidi)} の 帯で 止めましょう`;
      activeTry = runTry({
        mic,
        graph,
        judge: createHoldJudge({ targetMidi, toleranceCents: tolerance, allowOctave: false }),
        tryMs: CONFIG.stage3.tryMs,
        onUpdate: showHint,
      });
      const result = await activeTry.promise;
      activeTry = null;
      if (ended || disposed || session.mic !== mic) return; // 途中で終わった・離れた・マイクが止まった
      trying = false;
      showResult(result.done, graph);
    }

    function showResult(done, graphNow) {
      tries += 1;
      if (done) successes += 1;
      ladder.answer(done);
      graphNow.setOk(done);
      hint.textContent = '';
      status.textContent = done ? TEXT.ok : TEXT.close;
      startBtn.replaceWith(button('つぎへ', showTry));
      listenBtn.disabled = false;
    }

    refreshButtons();
    root.replaceChildren(
      title(),
      note(`レベル ${ladder.level}`),
      status,
      hint,
      canvas,
      listenBtn,
      startBtn,
      endBtn,
      ...tipNote(),
    );
  }

  showIntro();
  return () => {
    disposed = true;
    if (activeTry) activeTry.cancel();
    deps.stopAll();
    session.close();
    if (tries > 0) save();
  };
}
