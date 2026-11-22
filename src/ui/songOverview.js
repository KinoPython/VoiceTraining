// 曲全体のお手本の音を横長に描き、指でなぞった区間を選ばせるキャンバス。
// 描くのは作ったとき・setSelection・setPlayhead のときだけ。
const TAP_MOVE_PX = 8; // これ未満しか動かなかったら「タップ」とみなして何も選ばない
const MARGIN_SEMITONES = 2; // 上下に少し余白をとる

// 横の位置（px）→ 曲の中の秒。範囲の外は 0〜durationSec に入れる
export function xToSec(x, width, durationSec) {
  if (!(width > 0)) return 0;
  const ratio = Math.min(1, Math.max(0, x / width));
  return ratio * durationSec;
}

function readColors() {
  const css = getComputedStyle(document.documentElement);
  const get = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    band: get('--band', '#e4e6fb'),
    note: get('--muted', '#6b6975'),
    select: get('--accent', '#5b6cf0'),
  };
}

// 大きさは CSS（clientWidth/Height）で測る。実サイズで測ると雪だるま式に増えるため
function fitCanvas(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 300;
  const height = canvas.clientHeight || 120;
  const pxW = Math.round(width * dpr);
  const pxH = Math.round(height * dpr);
  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

// 音の高さの範囲（一番低い音〜一番高い音 ±2）。音が無いときは適当な範囲
function midiRange(notes) {
  if (notes.length === 0) return { lo: 48, hi: 72 };
  const midis = notes.map((n) => n.midi);
  return { lo: Math.min(...midis) - MARGIN_SEMITONES, hi: Math.max(...midis) + MARGIN_SEMITONES };
}

export function createSongOverview(canvas, { notes, durationSec, onSelect }) {
  let selection = null; // { start, end }（秒）
  let playheadSec = null;
  const { lo, hi } = midiRange(notes);
  canvas.classList.add('song-overview');

  function drawNotes(ctx, colors, width, height) {
    ctx.strokeStyle = colors.note;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const n of notes) {
      const y = height - ((n.midi - lo) / (hi - lo)) * height;
      ctx.moveTo(xOfSec(n.startMs / 1000, width), y);
      ctx.lineTo(xOfSec(n.endMs / 1000, width), y);
    }
    ctx.stroke();
  }

  function xOfSec(sec, width) {
    return durationSec > 0 ? (sec / durationSec) * width : 0;
  }

  function draw() {
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return; // jsdom など描けない環境では何もしない
    const { width, height } = fitCanvas(canvas, ctx);
    const colors = readColors();
    ctx.clearRect(0, 0, width, height);
    if (selection) {
      const x0 = xOfSec(selection.start, width);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = colors.select;
      ctx.fillRect(x0, 0, xOfSec(selection.end, width) - x0, height);
      ctx.globalAlpha = 1;
    }
    drawNotes(ctx, colors, width, height);
    if (playheadSec !== null) {
      const x = xOfSec(playheadSec, width);
      ctx.fillStyle = colors.select;
      ctx.fillRect(x - 1, 0, 2, height);
    }
  }

  // --- 指でなぞる ---
  let startX = null;
  let before = null; // なぞる前の選び（タップで取り消すとき戻す）
  function localX(e) {
    const rect = canvas.getBoundingClientRect();
    return e.clientX - rect.left;
  }
  function width() {
    return canvas.clientWidth || 300;
  }
  function preview(x) {
    const a = xToSec(startX, width(), durationSec);
    const b = xToSec(x, width(), durationSec);
    selection = { start: Math.min(a, b), end: Math.max(a, b) };
    draw();
  }
  canvas.addEventListener('pointerdown', (e) => {
    startX = localX(e);
    before = selection;
    if (canvas.setPointerCapture && e.pointerId !== undefined) {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* 取れなくても動く */ }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    preview(localX(e));
  });
  canvas.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const x = localX(e);
    const moved = Math.abs(x - startX);
    const from = startX;
    startX = null;
    if (moved < TAP_MOVE_PX) {
      selection = before; // なぞり途中の仮の選びを、前の選びに戻す
      draw();
      return;
    }
    const a = xToSec(from, width(), durationSec);
    const b = xToSec(x, width(), durationSec);
    onSelect(Math.min(a, b), Math.max(a, b));
  });
  // 電話が来た・画面がスクロールしたなどで取り消されたときは、仮の選びを残さず前の選びに戻す
  canvas.addEventListener('pointercancel', () => {
    if (startX === null) return;
    startX = null;
    selection = before;
    draw();
  });

  draw();
  return {
    setSelection(startSec, endSec) {
      selection = startSec === null || startSec === undefined ? null : { start: startSec, end: endSec };
      draw();
    },
    setPlayhead(sec) {
      playheadSec = sec;
      draw();
    },
  };
}
