// 段6②：声のゆれの目安と、声の地図の外に出た読みの数。
import { CONFIG } from './config.js';

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// 声のある（midi が null でない）連続を、ひとまとまり（stretch）にして集める
function stretchesOf(readings) {
  const out = [];
  let cur = [];
  for (const r of readings) {
    if (r.midi == null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(r);
  }
  if (cur.length) out.push(cur);
  return out;
}

// ゆれの目安。まとまりごとに「中央値からのずれ（セント）の標準偏差」を出し、
// まとまりの長さ（最後の t − 最初の t）で重みをつけて平均する。
// 注意：結果の medianCents は名前が歴史的なだけで、中身はこの「重みつき標準偏差」（整数に丸め）。
export function stabilityOf(readings, opts = CONFIG.stage6.yt) {
  const used = [];
  for (const st of stretchesOf(readings)) {
    const ms = st[st.length - 1].t - st[0].t;
    if (ms < opts.minVoicedMs) continue; // 短すぎるまとまりは使わない
    const med = median(st.map((r) => r.midi));
    const dev = st.map((r) => (r.midi - med) * 100);
    const mean = dev.reduce((a, b) => a + b, 0) / dev.length;
    const sd = Math.sqrt(dev.reduce((a, d) => a + (d - mean) ** 2, 0) / dev.length);
    used.push({ ms, sd });
  }
  if (!used.length) return { label: 'none', medianCents: null, stretches: 0 };
  const total = used.reduce((a, u) => a + u.ms, 0);
  const avg = used.reduce((a, u) => a + u.sd * u.ms, 0) / total;
  const label = avg <= opts.stableCents ? 'steady' : avg <= opts.wobblyCents ? 'some' : 'wobbly';
  return { label, medianCents: Math.round(avg), stretches: used.length };
}

// 声の地図（low〜high）より上・下に出た読みの数。range が無ければ 0・0
export function outsideRange(readings, range) {
  if (!range) return { above: 0, below: 0 };
  let above = 0;
  let below = 0;
  for (const r of readings) {
    if (r.midi == null) continue;
    if (r.midi > range.high) above++;
    else if (r.midi < range.low) below++;
  }
  return { above, below };
}
