// 段6 好きな曲：曲の一覧と、曲の追加・ファイルの選びなおし
// 曲のファイル・お手本の線はスマホの中（IndexedDB）だけに置く。外には送らない
import { go } from '../router.js';
import { button, heading, note } from '../ui/components.js';
import { STAGE6_TEXT as T } from '../data/copy.js';
import { CONFIG } from '../logic/config.js';
import {
  loadState, addSong, updateSong, removeSong, getSong, newId, requestPersist,
} from '../storage/store.js';
import { putFile, getFile, removeSongFiles, isReadFailure } from '../storage/songFiles.js';
import { parseYoutubeId } from '../logic/youtubeUrl.js';
import { extractLine, toNotes, keyAdvice, mixToMono } from '../logic/songLine.js';
import { getAudioContext } from '../audio/tone.js';

const defaultDeps = {
  // ファイルを音のデータに読む。読めない形式なら例外になる（呼び出し側で受ける）
  decode: async (blob) => getAudioContext().decodeAudioData(await blob.arrayBuffer()),
  extractLine,
  putFile,
  getFile,
  removeSongFiles,
  requestPersist,
  confirm: (text) => window.confirm(text),
};

const isAbort = (e) => e && e.name === 'AbortError';
// 置き場から読んだものが、使えるファイルか（無い・読めなかったではない）
const isPresent = (v) => v !== null && !isReadFailure(v);

// 曲の印：🎵 曲ファイル・🎤 歌声だけ
const marksOf = (song) => `${song.hasFile ? '🎵' : ''}${song.hasVocal ? '🎤' : ''}${song.youtubeId ? '▶' : ''}`;

// YouTube の入力欄に入れる、いまの動画のアドレス（ID から作りなおす）
const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

// 開く先：曲ファイルか歌声だけがあれば今までの曲の画面。YouTube だけなら YouTube の曲の画面
const openSong = (song) => (!song.hasFile && !song.hasVocal && song.youtubeId ? go('songYt', { id: song.id }) : go('song', { id: song.id }));

// 2つの長さが近いか（ちがいすぎると別の曲かもしれない。止めずに知らせるだけ）
const lengthsDiffer = (a, b) => Math.abs(a - b) >= CONFIG.stage6.lengthMismatchSec;

export function renderStage6List(root, params, deps = defaultDeps) {
  const d = { ...defaultDeps, ...deps };
  let controller = null; // 線を作っている間だけある。画面を離れたら止める
  let disposed = false;

  // ---------- 一覧 ----------
  function showList() {
    const songs = loadState().songs;
    const list = document.createElement('div');
    if (songs.length === 0) list.append(note(T.empty));
    for (const song of songs) list.append(songRow(song));
    root.replaceChildren(
      heading(T.title),
      note(T.earphone),
      note(T.highCare),
      list,
      button(T.add, showForm),
      button('ホームへ', () => go('home')),
    );
  }

  function songRow(song) {
    const card = document.createElement('div');
    card.className = 'card';
    const open = button(song.title, () => openSong(song));
    const marks = note(marksOf(song));
    const status = note('');
    card.append(open, marks, status, button(T.ytButton, () => showYtForm(song)), button(T.refileButton, () => showRefile(song)), button(T.remove, () => confirmRemove(song)));
    markMissingFiles(song, status);
    return card;
  }

  // バックアップから戻した別のスマホでは、ファイルが無い。見つからなければ選びなおしを促す。
  // 読めなかっただけ（つながりが切れたなど）のときは、ファイルはあるかもしれないので促さない
  async function markMissingFiles(song, status) {
    const kinds = [song.hasFile && 'file', song.hasVocal && 'vocal'].filter(Boolean);
    if (kinds.length === 0) return;
    const found = await Promise.all(kinds.map((k) => d.getFile(song.id, k)));
    if (!disposed && found.every((f) => f === null)) status.textContent = T.refile;
  }

  async function confirmRemove(song) {
    if (!d.confirm(T.confirmDelete)) return;
    removeSong(song.id);
    await d.removeSongFiles(song.id);
    if (!disposed) showList();
  }

  // ---------- ファイルを選ぶ入力 ----------
  function picker(picked, kind, label) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.hidden = true;
    input.dataset.kind = kind;
    const name = note('');
    input.addEventListener('change', () => {
      picked[kind] = input.files?.[0] ?? null;
      name.textContent = picked[kind] ? picked[kind].name : '';
    });
    return [input, button(label, () => input.click()), name];
  }

  // ---------- 追加の入力 ----------
  function showForm() {
    const picked = { file: null, vocal: null };
    let title = '';
    const message = note('');

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.placeholder = T.titleLabel;
    titleInput.setAttribute('aria-label', T.titleLabel);
    titleInput.addEventListener('input', () => { title = titleInput.value; });

    const yt = ytInput('');

    root.replaceChildren(
      heading(T.add),
      note(T.rights),
      titleInput,
      ...picker(picked, 'file', T.pickFile),
      ...picker(picked, 'vocal', T.pickVocal),
      button(T.guide, () => go('vocalGuide')),
      yt.input,
      // 上の rights は 買った 曲の 話。YouTube は 取り出さず 流すだけ、と 欄の すぐ下で 分けて 伝える
      note(T.ytRights),
      note(T.ytNotice),
      message,
      button(T.submit, () => {
        if (title.trim() === '') { message.textContent = T.needTitle; return; }
        const address = yt.value().trim();
        const youtubeId = address === '' ? null : parseYoutubeId(address);
        // 読み取れないアドレスは、ファイルを選んでいても足さない（まちがいに気づけるように）
        if (address !== '' && !youtubeId) { message.textContent = T.ytBadId; return; }
        if (!picked.file && !picked.vocal) {
          if (!youtubeId) { message.textContent = T.needFile; return; }
          addYoutubeOnly(title.trim(), youtubeId);
          return;
        }
        addNew(title.trim(), picked, youtubeId);
      }),
      button(T.cancel, showList),
    );
  }

  // YouTube のアドレスを入れる欄
  function ytInput(initial) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = T.ytLabel;
    input.setAttribute('aria-label', T.ytLabel);
    input.value = initial;
    return { input, value: () => input.value };
  }

  // YouTube だけの曲：ファイルは読まない・保存しない。記録だけ足して YouTube の曲の画面へ
  function addYoutubeOnly(title, youtubeId) {
    const id = newId();
    const added = addSong({
      id, title, hasFile: false, hasVocal: false, durationSec: 0, sections: [], keyAdvice: 0, youtubeId, ytSections: [],
    });
    if (!added.ok) { showError(T.saveFailed, showForm); return; }
    go('songYt', { id });
  }

  // ---------- 既にある曲の YouTube を足す・変える・消す ----------
  function showYtForm(song) {
    const message = note('');
    const yt = ytInput(song.youtubeId ? watchUrl(song.youtubeId) : '');
    root.replaceChildren(
      heading(`${song.title}：${T.ytButton}`),
      yt.input,
      note(T.ytRights),
      note(T.ytNotice),
      message,
      button(T.ytSave, () => {
        const address = yt.value().trim();
        const youtubeId = address === '' ? null : parseYoutubeId(address);
        if (address !== '' && !youtubeId) { message.textContent = T.ytBadId; return; }
        // 消しても ytSections は残す（アドレスをまた足したとき戻せる）
        const updated = updateSong(song.id, { youtubeId });
        if (!updated.ok) { message.textContent = T.saveFailed; return; }
        showList();
      }),
      button(T.cancel, showList),
    );
  }

  // ---------- 選びなおしの入力 ----------
  // 別のスマホに戻したときなど。区間と前回の自分の線は残したまま、ファイルと線だけ入れなおす
  function showRefile(song) {
    const picked = { file: null, vocal: null };
    const message = note('');
    root.replaceChildren(
      heading(`${song.title}：${T.refileButton}`),
      note(T.refileNote),
      note(T.rights),
      ...picker(picked, 'file', T.pickFile),
      ...picker(picked, 'vocal', T.pickVocal),
      button(T.guide, () => go('vocalGuide')),
      message,
      button(T.refileSubmit, () => {
        if (!picked.file && !picked.vocal) { message.textContent = T.needFile; return; }
        refile(song, picked);
      }),
      button(T.cancel, showList),
    );
  }

  // ---------- 読んで線を作る（追加・選びなおしで同じ） ----------
  function showError(text, back) {
    root.replaceChildren(heading(T.add), note(text), button('もどる', back));
  }

  function showProgress(headText) {
    const progress = note(`${T.building} 0%`);
    root.replaceChildren(heading(headText), progress, button(T.cancel, () => { controller.abort(); showList(); }));
    return progress;
  }

  // 1つずつ読む。線に使わない方（歌声だけがあるときの曲ファイル）は先に読んで長さだけ覚え、音のデータは手放す。
  // 6分の曲を2つ同時に持つと、古い iPhone ではメモリが足りなくなるため
  async function decodeSources(sources) {
    const lineKind = sources.vocal ? 'vocal' : 'file';
    const durations = {};
    if (lineKind === 'vocal' && sources.file) durations.file = (await d.decode(sources.file)).duration;
    const buffer = await d.decode(sources[lineKind]);
    durations[lineKind] = buffer.duration;
    // 線に使うのは1本にまとめた波だけ。元の音のデータはここで手放す
    return { samples: mixToMono(buffer), sampleRate: buffer.sampleRate, durations, fromVocal: lineKind === 'vocal' };
  }

  // 読めない・止めた・画面を離れたときは null（読めないときは案内を出す）
  async function buildLine(sources, signal, progress, back) {
    let decoded;
    try {
      decoded = await decodeSources(sources);
    } catch {
      if (!disposed && !signal.aborted) showError(T.unreadable, back);
      return null;
    }
    if (signal.aborted) return null;
    const { samples, sampleRate, durations, fromVocal } = decoded;
    decoded = null;
    const notices = [];
    if (durations.file !== undefined && durations.vocal !== undefined && lengthsDiffer(durations.file, durations.vocal)) {
      notices.push(T.mismatch);
    }
    if (!fromVocal) notices.push(T.mixed); // 歌声だけが無ければ曲から作る（伴奏が混ざる）
    let line;
    try {
      line = await d.extractLine(samples, sampleRate, {
        signal,
        onProgress: (ratio) => { progress.textContent = `${T.building} ${Math.round(ratio * 100)}%`; },
      });
    } catch (e) {
      if (!isAbort(e) && !disposed && !signal.aborted) showError(T.unreadable, back);
      return null;
    }
    if (signal.aborted) return null;
    return {
      line: { hopMs: line.hopMs, midi: line.midi, fromVocal },
      durationSec: durations.file ?? durations.vocal,
      notices,
    };
  }

  // 選んだファイルと線を保存する。失敗したら理由（'quota' | 'other'）、止めたら 'aborted'、よければ null
  async function saveFiles(id, picked, line, signal) {
    const saves = [
      picked.file && ['file', picked.file],
      picked.vocal && ['vocal', picked.vocal],
      ['line', line],
    ].filter(Boolean);
    for (const [kind, data] of saves) {
      if (signal.aborted) return 'aborted'; // 画面を離れたら、残りは保存しない
      const result = await d.putFile(id, kind, data);
      if (!result.ok) return result.reason;
    }
    return signal.aborted ? 'aborted' : null;
  }

  const saveFailedText = (reason) => (reason === 'quota' ? T.saveFailed : T.saveFailedOther);

  // 知らせる文があれば、読めるように一度止めて、押したら曲の画面へ
  function finishWith(id, notices) {
    controller = null;
    if (disposed) return;
    if (notices.length === 0) return go('song', { id });
    root.replaceChildren(heading(T.add), ...notices.map(note), button(T.toSong, () => go('song', { id })));
  }

  // ---------- 追加の本体 ----------
  async function addNew(title, picked, youtubeId) {
    controller = new AbortController();
    const { signal } = controller;
    const progress = showProgress(T.add);
    const built = await buildLine(picked, signal, progress, showForm);
    if (!built) return;

    // 保存。どれか失敗したら、入れた分も消して曲は足さない
    const id = newId();
    const failed = await saveFiles(id, picked, built.line, signal);
    if (failed) {
      await d.removeSongFiles(id);
      if (failed !== 'aborted' && !disposed) showError(saveFailedText(failed), showForm);
      return;
    }

    // 曲を足す。キーの目安は段2の声の地図から（無ければ 0）。記録が書けなければファイルも消す
    const added = addSong({
      id, title, hasFile: Boolean(picked.file), hasVocal: Boolean(picked.vocal), durationSec: built.durationSec, sections: [],
      keyAdvice: keyAdvice(toNotes(built.line), loadState().range),
      youtubeId, ytSections: [],
    });
    if (!added.ok) {
      await d.removeSongFiles(id);
      controller = null;
      if (!disposed) showError(T.saveFailed, showForm);
      return;
    }
    d.requestPersist(); // 大きなファイルを入れたので、ブラウザに「消さないで」とお願いする
    finishWith(id, built.notices);
  }

  // ---------- 選びなおしの本体 ----------
  // 選ばなかった方は、スマホにあればそれを使う（歌声だけがあれば、線はそちらから作る）
  async function refile(song, picked) {
    controller = new AbortController();
    const { signal } = controller;
    const progress = showProgress(song.title);
    const onDevice = {};
    for (const kind of ['file', 'vocal']) {
      if (!picked[kind] && song[kind === 'file' ? 'hasFile' : 'hasVocal']) onDevice[kind] = await d.getFile(song.id, kind);
    }
    if (signal.aborted || disposed) return;
    const sources = {
      file: picked.file ?? (isPresent(onDevice.file) ? onDevice.file : null),
      vocal: picked.vocal ?? (isPresent(onDevice.vocal) ? onDevice.vocal : null),
    };
    const back = () => showRefile(song);
    const built = await buildLine(sources, signal, progress, back);
    if (!built) return;

    // 選んだファイルだけ保存しなおす（曲の記録が残っているので、失敗しても消さない）
    const failed = await saveFiles(song.id, picked, built.line, signal);
    if (failed) {
      controller = null;
      if (failed !== 'aborted' && !disposed) showError(saveFailedText(failed), back);
      return;
    }
    // 読めなかっただけのファイルは、あるかもしれないので印を残す
    const has = (kind) => Boolean(sources[kind]) || isReadFailure(onDevice[kind]);
    const updated = updateSong(song.id, {
      hasFile: has('file'), hasVocal: has('vocal'), durationSec: built.durationSec,
      keyAdvice: keyAdvice(toNotes(built.line), loadState().range),
    }); // 区間と前回の線（sections）は書きかえない
    if (!updated.ok) {
      controller = null;
      if (!disposed) showError(T.saveFailed, back);
      return;
    }
    finishWith(song.id, built.notices);
  }

  // 曲の画面の「ファイルを 選びなおす」から来たときは、その曲の選びなおしを出す
  const refileSong = params?.get?.('refile') ? getSong(params.get('refile')) : null;
  if (refileSong) showRefile(refileSong);
  else showList();
  return () => {
    disposed = true;
    controller?.abort(); // 作っている途中なら止める
  };
}
