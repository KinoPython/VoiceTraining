// 声の高さを「横に流れる線」で見せるキャンバス。
// 描くのは push / setBands / setOk / clear のときだけ（自前のアニメーションループは持たない）。
import { noteLabel } from '../logic/notes.js';

const LABEL_FONT = '11px system-ui, sans-serif';
const VOICE_LINE_WIDTH = 3;

// 高い音ほど上。minMidi が一番下（height）、maxMidi が一番上（0）
export function midiToY(midi, minMidi, maxMidi, height) {
  return height - ((midi - minMidi) / (maxMidi - minMidi)) * height;
}

// 色は :root のトークンから読む（暗い設定に切り替わっても追従するため、描くたびに読む）
function readColors() {
  const css = getComputedStyle(document.documentElement);
  const get = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    band: get('--band', '#e4e6fb'),
    bandOk: get('--band-ok', '#cfeedd'),
    voice: get('--accent', '#5b6cf0'),
    muted: get('--muted', '#6b6975'),
  };
}

// iPhone などの高精細画面でにじまないよう、実サイズ = CSS サイズ × dpr にする
function fitCanvas(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  // CSS の大きさ（clientWidth/Height）で測る。実サイズ(bitmap)で測ると大きさが雪だるま式に増えるため
  const width = canvas.clientWidth || 300;
  const height = canvas.clientHeight || 150;
  const pxW = Math.round(width * dpr);
  const pxH = Math.round(height * dpr);
  // サイズを代入すると中身が消えるので、変わったときだけ代入する
  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

export function createPitchGraph(canvas, { minMidi, maxMidi, windowMs = 6000 }) {
  let points = []; // { t, midi }。midi が null は「声なし」で線を切る
  let bands = [];
  let ok = false;
  let nowMs = 0;
  // 大きさを CSS で固定するための印（styles.css の canvas.pitch-graph）
  canvas.classList.add('pitch-graph');

  function xOf(t, width) {
    return ((t - (nowMs - windowMs)) / windowMs) * width;
  }

  // ドごとの横線と「ド3」などの文字
  function drawScale(ctx, colors, width, height) {
    ctx.font = LABEL_FONT;
    for (let m = Math.ceil(minMidi); m <= maxMidi; m++) {
      if (m % 12 !== 0) continue;
      const y = midiToY(m, minMidi, maxMidi, height);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = colors.muted;
      ctx.fillRect(0, y - 0.5, width, 1);
      ctx.globalAlpha = 1;
      // 一番上のドでも文字が絵の外に出ないよう、最低でも文字の高さ分は下げる
      ctx.fillText(noteLabel(m), 4, Math.max(y - 3, 11));
    }
  }

  // 帯：時間の指定がなければ横いっぱい、あれば窓の時間軸に合わせた階段状
  function drawBands(ctx, colors, width, height) {
    ctx.fillStyle = ok ? colors.bandOk : colors.band;
    for (const b of bands) {
      const top = midiToY(b.midi + b.cents / 100, minMidi, maxMidi, height);
      const bottom = midiToY(b.midi - b.cents / 100, minMidi, maxMidi, height);
      const timed = b.startMs !== undefined && b.endMs !== undefined;
      const x0 = timed ? Math.max(0, xOf(b.startMs, width)) : 0;
      const x1 = timed ? Math.min(width, xOf(b.endMs, width)) : width;
      if (x1 > x0) ctx.fillRect(x0, top, x1 - x0, bottom - top);
    }
  }

  function drawVoice(ctx, colors, width, height) {
    ctx.strokeStyle = colors.voice;
    ctx.lineWidth = VOICE_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let penDown = false;
    for (const p of points) {
      if (p.midi === null) {
        penDown = false;
        continue;
      }
      const x = xOf(p.t, width);
      const y = midiToY(p.midi, minMidi, maxMidi, height);
      // 線の最初の点は moveTo。1点だけでも丸い点として見えるよう lineTo も打つ
      if (!penDown) ctx.moveTo(x, y);
      ctx.lineTo(x, y);
      penDown = true;
    }
    ctx.stroke();
  }

  function draw() {
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return; // jsdom など描けない環境では何もしない
    const { width, height } = fitCanvas(canvas, ctx);
    const colors = readColors();
    ctx.clearRect(0, 0, width, height);
    drawBands(ctx, colors, width, height);
    drawScale(ctx, colors, width, height);
    drawVoice(ctx, colors, width, height);
  }

  return {
    push(now, midi) {
      nowMs = now;
      points.push({ t: now, midi });
      // 窓より古い点は捨てる（メモリが増え続けないように）
      const oldest = now - windowMs;
      points = points.filter((p) => p.t >= oldest);
      draw();
    },
    setBands(next) {
      bands = next;
      draw();
    },
    setOk(next) {
      ok = next;
      draw();
    },
    // 声の線だけ消す（帯は setBands で入れ替える）
    clear() {
      points = [];
      draw();
    },
  };
}
