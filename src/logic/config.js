// 数字の目安を1か所に集める。実機で試しながら、ここだけ変えればよい。
export const CONFIG = {
  pitch: { minHz: 65, maxHz: 1050, minClarity: 0.85, minRms: 0.01, smoothFrames: 5 },
  defaultRange: { comfort: 55, low: 50, high: 60 }, // 測る前。男女どちらでもとどく真ん中あたり（G3 前後）
  ladder: { upAfter: 2, maxLevel: 10 },
  tolerance: [ { upTo: 2, cents: 100 }, { upTo: 5, cents: 50 }, { upTo: 10, cents: 30 } ], // レベルごとの帯の半分の太さ
  hold: { holdMs: 1000, gapMs: 150 },
  stage1: { startGap: 7, minGap: 1, maxGap: 12, trials: 20, toneMs: 600, pauseMs: 300, lastForResult: 6 },
  stage2: { comfortMs: 3000, comfortNeedMs: 1000, glideMs: 8000, lowPct: 5, highPct: 95, minWidth: 5 },
  stage3: { tryMs: 10000, toneMs: 1000, graphSpan: 7 },
  stage4: { toneMs: 1500, waitMs: 500, tryMs: 6000 },
  stage5: { noteMs: 800, skipMs: 250, passRatio: 0.6 },
  session: { minutes: 10 },
  recommend: { passLevel: 4 }, // この水準に届いたら、おすすめが次の段へ進む
};
