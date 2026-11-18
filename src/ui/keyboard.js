// 鍵盤の絵（SVG）。印をつけた鍵に色が付く。色は styles.css の .kb-* クラスで決める。
import { noteLabel } from '../logic/notes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WHITE_W = 28;
const WHITE_H = 90;
const BLACK_W = 18;
const BLACK_H = 56;
const LABEL_H = 20;

// 半音 0,2,4,5,7,9,11（ド レ ミ ファ ソ ラ シ）が白鍵
const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const isWhite = (midi) => WHITE_PCS.has(((midi % 12) + 12) % 12);

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

// ドだけ「ド4」とオクターブ付き（今どこにいるか分かるように）。ほかは「レ」など
function whiteLabel(midi) {
  return midi % 12 === 0 ? noteLabel(midi) : noteLabel(midi).replace(/\d+$/, '');
}

function applyMark(node, midi, markByMidi) {
  const kind = markByMidi.get(midi);
  if (!kind) return;
  node.setAttribute('data-kind', kind);
  node.classList.add('kb-' + kind);
}

export function renderKeyboard({ fromMidi, toMidi, marks = [] }) {
  const markByMidi = new Map(marks.map((m) => [m.midi, m.kind]));
  const whites = [];
  for (let m = fromMidi; m <= toMidi; m++) if (isWhite(m)) whites.push(m);

  const svg = el('svg', {
    class: 'keyboard',
    viewBox: `0 0 ${whites.length * WHITE_W} ${WHITE_H + LABEL_H}`,
    role: 'img',
    'aria-label': '鍵盤',
  });

  // 白鍵を先に描き、黒鍵をその上に重ねる
  whites.forEach((midi, i) => {
    const rect = el('rect', { class: 'kb-white', x: i * WHITE_W, y: 0, width: WHITE_W, height: WHITE_H, 'data-midi': midi });
    applyMark(rect, midi, markByMidi);
    svg.appendChild(rect);
  });
  for (let m = fromMidi; m <= toMidi; m++) {
    if (isWhite(m)) continue;
    // 黒鍵は「すぐ下の白鍵」と次の白鍵の境目にまたがる
    const leftIndex = whites.indexOf(m - 1);
    if (leftIndex < 0) continue;
    const x = (leftIndex + 1) * WHITE_W - BLACK_W / 2;
    const rect = el('rect', { class: 'kb-black', x, y: 0, width: BLACK_W, height: BLACK_H, 'data-midi': m });
    applyMark(rect, m, markByMidi);
    svg.appendChild(rect);
  }
  whites.forEach((midi, i) => {
    const text = el('text', { class: 'kb-label', x: i * WHITE_W + WHITE_W / 2, y: WHITE_H + 14, 'text-anchor': 'middle' });
    text.textContent = whiteLabel(midi);
    svg.appendChild(text);
  });
  return svg;
}
