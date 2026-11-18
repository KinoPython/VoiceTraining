// ホーム。きょうのおすすめの段と、ほかの段・リンク
import { go } from '../router.js';
import { loadState } from '../storage/store.js';
import { recommendStage } from '../logic/recommend.js';
import { button, heading, note } from '../ui/components.js';
import { STAGES, MAP_FIRST_HINT } from '../data/copy.js';

function stageCard(stage) {
  const card = document.createElement('div');
  card.className = 'card';
  const title = document.createElement('strong');
  title.textContent = `段${stage.n}「${stage.name}」`;
  const desc = document.createElement('div');
  desc.textContent = `— ${stage.desc}`;
  card.append(title, desc);
  return card;
}

// ほかの段の1行。段2を測る前は、段3〜5に地図を先に測る一言を足す
function otherStage(stage, mapMeasured) {
  const wrap = stageCard(stage);
  wrap.append(button('ひらく', () => go(stage.route)));
  if (stage.n >= 3 && !mapMeasured) wrap.append(note(MAP_FIRST_HINT));
  return wrap;
}

export function renderHome(root) {
  const state = loadState();
  const recommended = STAGES[recommendStage(state) - 1];

  const recommend = document.createElement('section');
  recommend.className = 'recommend';
  recommend.append(
    heading('きょうの おすすめ'),
    stageCard(recommended),
    button('▶ はじめる', () => go('warmup', { next: recommended.route })),
    note('1回 10分くらいが 目安です。のどを 休める 日が あっても 大丈夫。'),
  );

  const others = document.createElement('section');
  others.className = 'others';
  others.append(...STAGES.map((s) => otherStage(s, state.range !== null)));

  const links = document.createElement('nav');
  links.className = 'links';
  links.append(
    button('きろく', () => go('record')),
    button('せってい', () => go('settings')),
    button('安全の こと', () => go('safety')),
    button('読みもの', () => go('learn')),
  );

  root.append(recommend, others, links);
}
