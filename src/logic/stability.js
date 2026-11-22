// 段6②：声のゆれの目安と、声の地図の外に出た読みの数。
import { CONFIG } from './config.js';

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// 声のある（midi が null でない）連続を、ひとまとまり（stretch）にして集める
function voicedRuns(readings) {
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

// 中央値をすぐ出せるように、高さを小さい順に並べたまま持つ入れ物
function sortedBox() {
  const xs = [];
  return {
    add(v) {
      let i = xs.length;
      while (i > 0 && xs[i - 1] > v) i--;
      xs.splice(i, 0, v);
    },
    median() {
      const n = xs.length;
      return n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
    },
  };
}

// 声のとぎれない1つの連続を、音ごとの「平ら（plateau）」に区切る。
// なぜ：曲では声をとぎらせずに次の音へ移るので、区切らないとメロディの上下まで「ゆれ」に入ってしまう。
// 新しい音の候補：平らの中央値から noteJumpCents 以上 はなれた読み、または すぐ前の読みから stepJumpCents 以上 とんだ読み。
// 候補の高さが holdReadings 読み 続いたら、そこから新しい平らにする。続かなければ「とんだ読み」として、
// 近くの平均に近い読み（ふつうのゆれ）は元の平らに戻し、遠い読み（1つだけ とんだ読み）は捨てる（ゆれを ふやさないため）
function plateausOf(run, opts) {
  const noteJump = opts.noteJumpCents / 100;
  const stepJump = opts.stepJumpCents / 100;
  const out = [];
  let plateau = [];
  let box = sortedBox();
  let pending = []; // 新しい音かもしれない読み（まだ決めていない）

  const addToPlateau = (r) => { plateau.push(r); box.add(r.midi); };
  const last = (xs) => xs[xs.length - 1];
  // 候補が続かなかった：平ら・候補・次の読みの平均から近い読みは元の平らへ、遠い読みは捨てる。
  // （平均を使うのは、平らが短いうちは中央値が ゆれの片側に寄って、ふつうのゆれまで捨ててしまうため）
  const giveBack = (next) => {
    const all = [...plateau, ...pending, ...(next ? [next] : [])];
    const center = all.reduce((a, r) => a + r.midi, 0) / all.length;
    for (const p of pending) if (Math.abs(p.midi - center) < noteJump) addToPlateau(p);
    pending = [];
  };
  const isBreak = (r) => Math.abs(r.midi - box.median()) >= noteJump || Math.abs(r.midi - last(plateau).midi) >= stepJump;
  const holds = (r) => Math.abs(r.midi - median(pending.map((p) => p.midi))) < noteJump
    && Math.abs(r.midi - last(pending).midi) < stepJump;

  for (const r of run) {
    if (pending.length && !holds(r)) giveBack(r);
    if (pending.length) {
      pending.push(r);
      if (pending.length >= opts.holdReadings) {
        out.push(plateau); // 新しい音が続いた：ここで区切る
        plateau = [];
        box = sortedBox();
        pending.splice(0).forEach(addToPlateau);
      }
    } else if (plateau.length && isBreak(r)) pending.push(r);
    else addToPlateau(r);
  }
  giveBack(null);
  if (plateau.length) out.push(plateau);
  return out;
}

const msOf = (st) => st[st.length - 1].t - st[0].t;
const medianMidi = (st) => median(st.map((r) => r.midi));

// 大きな ビブラートは、山と谷が それぞれ 短い「平ら」に 分かれてしまう（山と谷の 差が 1半音を こえるため）。
// 短い 平ら（wobbleMs より 短い）を はさんで、両どなりの 高さが 同じ くらい（noteJumpCents 未満）なら、
// 音が 変わったのではなく ゆれて 戻っただけ なので、3つを 1つに もどす
function mergeWobbles(plateaus, opts) {
  const ps = [...plateaus];
  let i = 1;
  while (i < ps.length - 1) {
    const back = Math.abs(medianMidi(ps[i - 1]) - medianMidi(ps[i + 1])) < opts.noteJumpCents / 100;
    if (msOf(ps[i]) < opts.wobbleMs && back) {
      ps.splice(i - 1, 3, [...ps[i - 1], ...ps[i], ...ps[i + 1]]);
      i = Math.max(1, i - 1); // つないだ 平らと、その先を もう一度 見る
    } else i++;
  }
  return ps;
}

// 1つの まとまりの ゆれ（中央値からの ずれ（セント）の 標準偏差）
function spreadOf(st) {
  const med = medianMidi(st);
  const dev = st.map((r) => (r.midi - med) * 100);
  const mean = dev.reduce((a, b) => a + b, 0) / dev.length;
  return Math.sqrt(dev.reduce((a, d) => a + (d - mean) ** 2, 0) / dev.length);
}

// 測りに 使う まとまりを 選ぶ。ふつうは minVoicedMs 以上 続いた 音（平ら）だけ。
// 速い 曲で 音が どれも 短い ときは、noteMinMs 以上の 音で 測り、それも 無ければ 声の 連続 そのもので 測る。
// なぜ：声が 聞こえたのに「声が 聞こえませんでした」と 出したり、回を 数えなかったり しないため
// （'none' は、声の 連続が minVoicedMs に とどかない ときだけ）
function measuredStretches(readings, opts) {
  const runs = voicedRuns(readings).filter((run) => msOf(run) >= opts.minVoicedMs);
  if (!runs.length) return [];
  const plateaus = runs.flatMap((run) => mergeWobbles(plateausOf(run, opts), opts));
  const long = plateaus.filter((st) => msOf(st) >= opts.minVoicedMs);
  if (long.length) return long;
  const short = plateaus.filter((st) => msOf(st) >= opts.noteMinMs);
  return short.length ? short : runs;
}

// ゆれの目安。音ごとの まとまりに ついて ゆれ（標準偏差）を出し、
// まとまりの長さ（最後の t − 最初の t）で重みをつけて平均する。
// label：'few'（少なめ）| 'normal'（ふつう）| 'many'（多め）| 'none'（使える声が無い）。
// 注意：結果の medianCents は名前が歴史的なだけで、中身はこの「重みつき標準偏差」（整数に丸め）。stretches は使った まとまりの数
export function stabilityOf(readings, opts = { ...CONFIG.stage6.yt, noteMinMs: CONFIG.stage6.noteMinMs }) {
  const used = measuredStretches(readings, opts).map((st) => ({ ms: msOf(st), sd: spreadOf(st) }));
  if (!used.length) return { label: 'none', medianCents: null, stretches: 0 };
  const total = used.reduce((a, u) => a + u.ms, 0);
  const avg = total > 0 ? used.reduce((a, u) => a + u.sd * u.ms, 0) / total : 0;
  const label = avg <= opts.stableCents ? 'few' : avg <= opts.wobblyCents ? 'normal' : 'many';
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

// 読み1つぶんの時間（ms）。となりどうしの t の差の中央値（読めなければ hopMs）
function msPerReading(readings, hopMs) {
  const gaps = [];
  for (let i = 1; i < readings.length; i++) {
    const g = readings[i].t - readings[i - 1].t;
    if (g > 0) gaps.push(g);
  }
  return gaps.length ? median(gaps) : hopMs;
}

// 地図の外に「あった」か（上・下べつべつ）。読みの数は 1秒に 約60回 と多く、そのまま出すと
// 「何十回も 外れた」と読まれるので、数は出さず、合わせて outsideMinMs 以上 出たときだけ true にする
// （ちょっと とんだ読みだけでは 知らせない）
export function outsideFlags(readings, range, opts = { ...CONFIG.stage6.yt, hopMs: CONFIG.stage6.hopMs }) {
  const { above, below } = outsideRange(readings, range);
  const each = msPerReading(readings, opts.hopMs);
  return { above: above * each >= opts.outsideMinMs, below: below * each >= opts.outsideMinMs };
}
