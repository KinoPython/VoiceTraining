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

// まとまりの 長さ（ms）。最後の t − 最初の t に、読み 1つぶんの 時間を 足す。
// なぜ：読み 1つ 1つは その 時間ぶんの 声を 表すので、足さないと 400ms 歌った 音が 383ms（1秒に 約60回の とき）に なり、短く 数えすぎる
const spanOf = (st, each) => st[st.length - 1].t - st[0].t + each;
const medianMidi = (st) => median(st.map((r) => r.midi));
const MAX_DEV_CENTS = 300; // 1つの 読みの ずれは ここで 頭打ち（読みちがい 1つで ゆれが 大きく なりすぎないため）
const WOBBLE_RETURN_CENTS = 200; // 短い 平らが、両どなりの どちらからも これ 未満なら「ゆれて 戻った」とみなす

// 大きな ビブラートは、山と谷が それぞれ 短い「平ら」に 分かれてしまう（山と谷の 差が 1半音を こえるため）。
// 短い 平ら（wobbleMs より 短い）を はさんで、両どなりの 高さが 同じ くらい（noteJumpCents 未満）なら：
// ・短い 平らが 両どなりの どちらからも 200 セント 未満 → ゆれて 戻っただけ なので、3つを 1つに もどす
// ・それより 遠い（オクターブ とびなどの 読みちがい、2半音 以上の 装飾音）→ 短い 平らだけ 捨てて、
//   両どなりは 別々の 平らの まま にする（つなぐと、遠い 読みが 大きな ゆれに 見えて しまうため）
function mergeWobbles(plateaus, opts, each) {
  const ps = [...plateaus];
  const cents = (a, b) => Math.abs(medianMidi(a) - medianMidi(b)) * 100;
  let i = 1;
  while (i < ps.length - 1) {
    const short = spanOf(ps[i], each) < opts.wobbleMs;
    const back = cents(ps[i - 1], ps[i + 1]) < opts.noteJumpCents;
    if (!short || !back) { i++; continue; }
    const near = cents(ps[i], ps[i - 1]) < WOBBLE_RETURN_CENTS && cents(ps[i], ps[i + 1]) < WOBBLE_RETURN_CENTS;
    if (near) {
      ps.splice(i - 1, 3, [...ps[i - 1], ...ps[i], ...ps[i + 1]]);
      i = Math.max(1, i - 1); // つないだ 平らと、その先を もう一度 見る
    } else ps.splice(i, 1); // 短い 平らだけ 捨てる（数えない）。次は 右どなりを 見る
  }
  return ps;
}

// 1つの まとまりの ゆれ（中央値からの ずれ（セント）の 標準偏差）。ずれは ±300 セントで 頭打ち
export function spreadOf(st) {
  const med = medianMidi(st);
  const dev = st.map((r) => Math.max(-MAX_DEV_CENTS, Math.min(MAX_DEV_CENTS, (r.midi - med) * 100)));
  const mean = dev.reduce((a, b) => a + b, 0) / dev.length;
  return Math.sqrt(dev.reduce((a, d) => a + (d - mean) ** 2, 0) / dev.length);
}

// 読みの 時刻・高さが 数で ない（NaN・Infinity）ものは 捨てる（null は「声が 無い」として 残す）
const usable = (readings) => readings.filter((r) => Number.isFinite(r?.t) && (r.midi == null || Number.isFinite(r.midi)));

// 測りに 使う まとまりを 選ぶ。ふつうは minVoicedMs 以上 続いた 音（平ら）だけ。
// 速い 曲で 音が どれも 短い ときは、noteMinMs 以上の 音で 測る。
// それも 無ければ 測らない（'short'）。声の 連続 そのもので 測ると、メロディの 上下を ゆれと 読んで しまうため。
// 返すのは { voiced, stretches }。voiced：minVoicedMs 以上 続いた 声が あったか（無ければ 'none'）
function measuredStretches(readings, opts, each) {
  const runs = voicedRuns(readings).filter((run) => spanOf(run, each) >= opts.minVoicedMs);
  if (!runs.length) return { voiced: false, stretches: [] };
  const plateaus = runs.flatMap((run) => mergeWobbles(plateausOf(run, opts), opts, each));
  const long = plateaus.filter((st) => spanOf(st, each) >= opts.minVoicedMs);
  if (long.length) return { voiced: true, stretches: long };
  return { voiced: true, stretches: plateaus.filter((st) => spanOf(st, each) >= opts.noteMinMs) };
}

const DEFAULT_OPTS = { ...CONFIG.stage6.yt, noteMinMs: CONFIG.stage6.noteMinMs, hopMs: CONFIG.stage6.hopMs };

// ゆれの目安。音ごとの まとまりに ついて ゆれ（標準偏差）を出し、まとまりの長さで重みをつけて平均する。
// label：'few'（少なめ）| 'normal'（ふつう）| 'many'（多め）|
//        'short'（声は 聞こえたが、伸ばす 所が 少なくて 測れない）| 'none'（使える声が無い）。
// 注意：結果の medianCents は名前が歴史的なだけで、中身はこの「重みつき標準偏差」（整数に丸め）。stretches は使った まとまりの数
export function stabilityOf(readings, opts = DEFAULT_OPTS) {
  const clean = usable(readings);
  const each = msPerReading(clean, opts.hopMs ?? CONFIG.stage6.hopMs);
  const { voiced, stretches } = measuredStretches(clean, opts, each);
  if (!voiced) return { label: 'none', medianCents: null, stretches: 0 };
  if (!stretches.length) return { label: 'short', medianCents: null, stretches: 0 };
  const used = stretches.map((st) => ({ ms: spanOf(st, each), sd: spreadOf(st) }));
  const total = used.reduce((a, u) => a + u.ms, 0);
  // total が 0 になる ことは ふつう無いが、0 で 割って NaN を 出さない ように しておく
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
