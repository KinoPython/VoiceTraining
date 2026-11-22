// きろく：聞き分けの変化・いまの声の地図・日ごとの一覧
import { go } from '../router.js';
import { button, heading, note } from '../ui/components.js';
import { renderKeyboard } from '../ui/keyboard.js';
import { STAGES } from '../data/copy.js';
import { gapLabel } from '../logic/notes.js';
import { loadState } from '../storage/store.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 300;
const H = 140;
const PAD_X = 16;
const PAD_TOP = 12;
const PAD_BOTTOM = 24; // 下に少しすき間（いちばん小さい点が枠にくっつかないように）
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const isWhite = (midi) => WHITE_PCS.includes(((midi % 12) + 12) % 12);

function svgEl(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

// 段1の記録から「日ごとのいちばん小さい value」を日付順に取り出す
export function dailyMinGaps(history) {
  const byDate = new Map();
  for (const h of history) {
    if (h.stage !== 1) continue;
    byDate.set(h.date, Math.min(byDate.get(h.date) ?? Infinity, h.value));
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
}

// 値が小さいほど下に置く。全部同じ値なら真ん中に並べる
function pointsFor(days) {
  const values = days.map((d) => d.value);
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo;
  const usable = H - PAD_TOP - PAD_BOTTOM;
  const x = (i) => (days.length === 1 ? W / 2 : PAD_X + (i * (W - 2 * PAD_X)) / (days.length - 1));
  const y = (v) => (span === 0 ? PAD_TOP + usable / 2 : PAD_TOP + ((Math.max(...values) - v) / span) * usable);
  return days.map((d, i) => [x(i), y(d.value)]);
}

function trendChart(days) {
  const svg = svgEl('svg', { class: 'trend', viewBox: `0 0 ${W} ${H}`, role: 'img' });
  const pts = pointsFor(days);
  if (pts.length >= 2) {
    svg.append(svgEl('polyline', { class: 'trend-line', fill: 'none', points: pts.map((p) => p.join(',')).join(' ') }));
  }
  for (const [cx, cy] of pts) svg.append(svgEl('circle', { class: 'trend-dot', cx, cy, r: 4 }));
  return svg;
}

function trendSection(history) {
  const days = dailyMinGaps(history);
  const box = document.createElement('div');
  box.className = 'card';
  if (days.length === 0) return null;
  box.append(note('聞き分けの 差の 変化'), trendChart(days), note('下に 行くほど、細かく 聞き分けられて います'));
  return box;
}

// 端が白鍵になるよう外側へ広げた、声の地図の鍵盤
function rangeKeyboard(range) {
  let fromMidi = range.low - 2;
  let toMidi = range.high + 2;
  while (!isWhite(fromMidi)) fromMidi -= 1;
  while (!isWhite(toMidi)) toMidi += 1;
  return renderKeyboard({
    fromMidi,
    toMidi,
    marks: [
      { midi: range.low, kind: 'b' },
      { midi: range.high, kind: 'b' },
      { midi: range.comfort, kind: 'a' },
    ],
  });
}

const sum = (list, key) => list.reduce((total, h) => total + h[key], 0);
const countText = (list) => `${sum(list, 'tries')}回 中 ${sum(list, 'successes')}回 できた`;

// 同じ日・同じ段の記録をまとめて、1行の文にする
function stageLine(stage, list) {
  const name = STAGES.find((s) => s.n === stage)?.name ?? `段${stage}`;
  if (stage === 1) return `${name}　差の 目安：${gapLabel(Math.min(...list.map((h) => h.value)))}`;
  if (stage === 2) return `${name}　幅 ${list[list.length - 1].value} 半音`;
  if (stage === 5) {
    const avg = sum(list, 'value') / list.length;
    return `${name}　${countText(list)}　合いぐあい 平均 ${Math.round(avg * 100)}%（目安）`;
  }
  return `${name}　${countText(list)}`;
}

// 段6は曲ごとに1行：回数は足し、合いぐあいは「回数で重みをつけた平均」にする
function stage6Lines(list) {
  const bySong = new Map();
  for (const h of list) bySong.set(h.songTitle ?? '（曲名なし）', [...(bySong.get(h.songTitle ?? '（曲名なし）') ?? []), h]);
  return [...bySong.entries()].map(([title, items]) => {
    const tries = sum(items, 'tries');
    const weighted = items.reduce((total, h) => total + h.value * h.tries, 0);
    const avg = tries > 0 ? weighted / tries : 0;
    return `好きな 曲：${title}　${countText(items)}・合いぐあい 平均 ${Math.round(avg * 100)}%（目安）`;
  });
}

// 日付ごと（新しい順）→ 段ごと（段の順）にまとめる
function groupByDay(history) {
  const days = new Map();
  for (const h of history) {
    if (!days.has(h.date)) days.set(h.date, new Map());
    const stages = days.get(h.date);
    stages.set(h.stage, [...(stages.get(h.stage) ?? []), h]);
  }
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function dailyList(history) {
  const wrap = document.createElement('div');
  for (const [date, stages] of groupByDay(history)) {
    const card = document.createElement('div');
    card.className = 'card';
    card.append(note(date));
    for (const stage of [...stages.keys()].sort((a, b) => a - b)) {
      const list = stages.get(stage);
      const lines = stage === 6 ? stage6Lines(list) : [stageLine(stage, list)];
      for (const line of lines) card.append(note(line));
    }
    wrap.append(card);
  }
  return wrap;
}

export function renderRecord(root) {
  const state = loadState();
  root.append(heading('きろく'));
  if (state.history.length === 0 && !state.range) {
    root.append(note('練習すると、ここに 記録が 出ます'));
  } else {
    const trend = trendSection(state.history);
    if (trend) root.append(trend);
    if (state.range) root.append(note('いまの 声の 地図'), rangeKeyboard(state.range));
    if (state.history.length === 0) root.append(note('練習すると、ここに 記録が 出ます'));
    root.append(dailyList(state.history));
  }
  root.append(button('ホームへ', () => go('home')));
}
