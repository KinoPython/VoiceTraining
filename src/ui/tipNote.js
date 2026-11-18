import { note } from './components.js';
import tips from '../data/tips.json';

// 段のコツを1つ、「💡 」つきで返す（一覧が空・無いなら何も出さない）。
// index が増えるたびに次のコツへ進み、最後まで行ったら最初に戻る。
// 配列で返すのは、画面側が ...tipNote(...) と並べるだけで済むようにするため。
export function tipNote(stageKey, index, list = tips[stageKey]) {
  const n = list?.length ?? 0;
  if (n === 0) return [];
  const el = note('💡 ' + list[((index % n) + n) % n]);
  el.classList.add('tip');
  return [el];
}
