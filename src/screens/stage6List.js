// 段6 好きな曲：曲の一覧と、曲の追加
// 曲のファイル・お手本の線はスマホの中（IndexedDB）だけに置く。外には送らない
import { go } from '../router.js';
import { button, heading, note } from '../ui/components.js';
import { STAGE6_TEXT as T } from '../data/copy.js';
import { CONFIG } from '../logic/config.js';
import { loadState, addSong, removeSong, newId } from '../storage/store.js';
import { putFile, getFile, removeSongFiles } from '../storage/songFiles.js';
import { extractLine, toNotes, keyAdvice, mixToMono } from '../logic/songLine.js';
import { getAudioContext } from '../audio/tone.js';

const defaultDeps = {
  // ファイルを音のデータに読む。読めない形式なら例外になる（呼び出し側で受ける）
  decode: async (blob) => getAudioContext().decodeAudioData(await blob.arrayBuffer()),
  extractLine,
  putFile,
  getFile,
  removeSongFiles,
  confirm: (text) => window.confirm(text),
};

const isAbort = (e) => e && e.name === 'AbortError';

// 曲の印：🎵 曲ファイル・🎤 歌声だけ
const marksOf = (song) => `${song.hasFile ? '🎵' : ''}${song.hasVocal ? '🎤' : ''}`;

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
    const open = button(song.title, () => go('song', { id: song.id }));
    const marks = note(marksOf(song));
    const status = note('');
    card.append(open, marks, status, button(T.remove, () => confirmRemove(song)));
    markMissingFiles(song, status);
    return card;
  }

  // バックアップから戻した別のスマホでは、ファイルが無い。見つからなければ選びなおしを促す
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

    const picker = (kind, label) => {
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
    };

    root.replaceChildren(
      heading(T.add),
      titleInput,
      ...picker('file', T.pickFile),
      ...picker('vocal', T.pickVocal),
      button(T.guide, () => go('vocalGuide')),
      message,
      button(T.submit, () => {
        if (title.trim() === '') { message.textContent = T.needTitle; return; }
        if (!picked.file && !picked.vocal) { message.textContent = T.needFile; return; }
        addNew(title.trim(), picked);
      }),
      button(T.cancel, showList),
    );
  }

  // ---------- 追加の本体 ----------
  function showError(text) {
    root.replaceChildren(heading(T.add), note(text), button('もどる', showForm));
  }

  // 2つの長さが近いか（ちがいすぎると別の曲かもしれない。止めずに知らせるだけ）
  const lengthsDiffer = (a, b) => Math.abs(a.duration - b.duration) >= CONFIG.stage6.lengthMismatchSec;

  async function addNew(title, picked) {
    controller = new AbortController();
    const { signal } = controller;
    const progress = note(`${T.building} 0%`);
    root.replaceChildren(heading(T.add), progress, button(T.cancel, () => { controller.abort(); showList(); }));

    // 1. 読む。読めなければ止める（曲は足さない）
    const buffers = {};
    try {
      for (const kind of ['file', 'vocal']) {
        if (picked[kind]) buffers[kind] = await d.decode(picked[kind]);
      }
    } catch {
      if (!disposed && !signal.aborted) showError(T.unreadable);
      return;
    }
    if (signal.aborted) return;
    const notices = [];
    if (buffers.file && buffers.vocal && lengthsDiffer(buffers.file, buffers.vocal)) notices.push(T.mismatch);

    // 2. お手本の線。歌声だけがあればそれから。無ければ曲から（伴奏が混ざる）
    const fromVocal = Boolean(buffers.vocal);
    const source = buffers.vocal ?? buffers.file;
    if (!fromVocal) notices.push(T.mixed);
    let line;
    try {
      line = await d.extractLine(mixToMono(source), source.sampleRate, {
        signal,
        onProgress: (ratio) => { progress.textContent = `${T.building} ${Math.round(ratio * 100)}%`; },
      });
    } catch (e) {
      if (!isAbort(e) && !disposed && !signal.aborted) showError(T.unreadable);
      return;
    }
    if (signal.aborted) return;

    // 3. 保存。どれか失敗したら、入れた分も消して曲は足さない
    const id = newId();
    const saves = [
      picked.file && ['file', picked.file],
      picked.vocal && ['vocal', picked.vocal],
      ['line', { hopMs: line.hopMs, midi: line.midi, fromVocal }],
    ].filter(Boolean);
    for (const [kind, data] of saves) {
      if (signal.aborted) break; // 画面を離れたら、残りは保存しない（下で入れた分を消す）
      const result = await d.putFile(id, kind, data);
      if (!result.ok) {
        await d.removeSongFiles(id);
        if (!disposed) showError(result.reason === 'quota' ? T.saveFailed : T.saveFailedOther);
        return;
      }
    }
    if (signal.aborted) { await d.removeSongFiles(id); return; }

    // 4. 曲を足す。キーの目安は段2の声の地図から（無ければ 0）
    const durationSec = (buffers.file ?? buffers.vocal).duration;
    addSong({
      id, title, hasFile: Boolean(picked.file), hasVocal: Boolean(picked.vocal), durationSec, sections: [],
      keyAdvice: keyAdvice(toNotes(line), loadState().range),
    });
    controller = null;
    if (disposed) return;
    // 知らせる文があれば、読めるように一度止めて、押したら曲の画面へ
    if (notices.length === 0) return go('song', { id });
    root.replaceChildren(heading(T.add), ...notices.map(note), button(T.toSong, () => go('song', { id })));
  }

  showList();
  return () => {
    disposed = true;
    controller?.abort(); // 作っている途中なら止める
  };
}
