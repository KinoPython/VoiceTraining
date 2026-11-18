// 読みもの。一覧（learn）と、1本の記事（article）の2つの画面
import { go } from '../router.js';
import { button, heading, note } from '../ui/components.js';
import posture from '../data/articles/posture.json';
import breath from '../data/articles/breath.json';
import relax from '../data/articles/relax.json';
import pitchEar from '../data/articles/pitch-ear.json';

// 一覧の並び順もこの順
export const ARTICLES = [posture, breath, relax, pitchEar];

function section(title, items) {
  const wrap = document.createElement('section');
  const h = document.createElement('h2');
  h.textContent = title;
  const ul = document.createElement('ul');
  for (const text of items) {
    const li = document.createElement('li');
    li.textContent = text;
    ul.append(li);
  }
  wrap.append(h, ul);
  return wrap;
}

// 出典は閉じておく。開くと、題名・出している所・リンクが見える
function sourcesBlock(sources) {
  const details = document.createElement('details');
  details.className = 'sources';
  const summary = document.createElement('summary');
  summary.textContent = '出典';
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

export function renderLearn(root) {
  root.append(heading('読みもの'));
  for (const a of ARTICLES) {
    const card = document.createElement('div');
    card.className = 'card';
    const title = document.createElement('strong');
    title.textContent = a.title;
    const summary = document.createElement('div');
    summary.textContent = a.summary;
    card.append(title, summary, button('読む', () => go('article', { id: a.id })));
    root.append(card);
  }
  root.append(button('ホームへ', () => go('home')));
}

export function renderArticle(root, params) {
  const a = ARTICLES.find((x) => x.id === params.get('id'));
  if (!a) {
    root.append(heading('読みもの'), note('その 読みものは 見つかりませんでした。'), button('読みものへ もどる', () => go('learn')));
    return;
  }
  const paragraphs = a.body.map((text) => note(text));
  root.append(
    heading(a.title),
    note(a.summary),
    ...paragraphs,
    section('きょう やること', a.today),
    section('注意', a.cautions),
    sourcesBlock(a.sources),
    note(`最終更新日：${a.updatedOn}`),
    button('読みものへ もどる', () => go('learn')),
  );
}
