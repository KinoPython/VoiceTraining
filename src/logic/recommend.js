// きょうのおすすめの段。順番に進める：聞き分け → 声の地図 → 目標の高さ → メロディ。
import { CONFIG } from './config.js';

const PASS_LEVEL = CONFIG.recommend.passLevel; // この水準に届いたら次の段へ

export function recommendStage(state) {
  if (!state.history.some((h) => h.stage === 1)) return 1;
  if (state.range === null) return 2;
  if (state.levels.s3 < PASS_LEVEL) return 3;
  if (state.levels.s4 < PASS_LEVEL) return 4;
  return 5;
}
