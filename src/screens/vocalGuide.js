// 歌声だけのファイルの作り方の案内（読みもの）。書き方は article.js にそろえる
import { go } from '../router.js';
import { button, heading, note } from '../ui/components.js';
import guide from '../data/vocalGuide.json';

export const VOCAL_GUIDE_TEXT = {
  pcHead: 'パソコンで 曲の ファイルを 見つける',
  makeHead: '歌声だけの ファイルを 作る',
  cautionHead: '注意',
  sources: '出典',
  updated: (d) => `最終更新日：${d}`,
  back: '曲の 一覧へ もどる',
};
const T = VOCAL_GUIDE_TEXT;

// 手順は番号つき（ol）、注意は点つき（ul）の一覧にする
function section(title, items, tag = 'ol') {
  const wrap = document.createElement('section');
  const h = document.createElement('h2');
  h.textContent = title;
  const list = document.createElement(tag);
  for (const text of items) {
    const li = document.createElement('li');
    li.textContent = text;
    list.append(li);
  }
  wrap.append(h, list);
  return wrap;
}

// 出典は閉じておく。開くと、題名・出している所・リンクが見える
function sourcesBlock(sources) {
  const details = document.createElement('details');
  details.className = 'sources';
  const summary = document.createElement('summary');
  summary.textContent = T.sources;
  const ul = document.createElement('ul');
  for (const s of sources) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = s.title;
    li.append(a, ` — ${s.publisher}`);
    ul.append(li);
  }
  details.append(summary, ul);
  return details;
}

export function renderVocalGuide(root) {
  root.append(
    heading(guide.title),
    note(guide.intro),
    section(T.pcHead, guide.pcSongSteps),
    section(T.makeHead, guide.steps),
    section(T.cautionHead, guide.cautions, 'ul'),
    sourcesBlock(guide.sources),
    note(T.updated(guide.updatedOn)),
    button(T.back, () => go('stage6')),
  );
}
