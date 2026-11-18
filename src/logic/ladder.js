import { CONFIG } from './config.js';

// 段の上げ下げ：2回続けてできたら＋1、1回外れたら−1（0〜maxLevel の間）
export function createLadder({ level = 0, upAfter = CONFIG.ladder.upAfter, maxLevel = CONFIG.ladder.maxLevel } = {}) {
  let current = level;
  let streak = 0; // 続けてできた回数

  return {
    get level() {
      return current;
    },
    answer(ok) {
      if (ok) {
        streak += 1;
        if (streak >= upAfter) {
          current = Math.min(maxLevel, current + 1);
          streak = 0; // 上がったら、また1回目から数える
        }
      } else {
        current = Math.max(0, current - 1);
        streak = 0; // 外れたら連続は数えなおし
      }
      return current;
    },
  };
}
