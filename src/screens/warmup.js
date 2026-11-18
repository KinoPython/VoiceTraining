// 準備運動（1〜2分）。手順を1つずつ出し、「つぎへ」か「とばす」で進む
import { go } from '../router.js';
import { button, heading, note, safetyList } from '../ui/components.js';
import { SAFETY_LINES } from '../data/copy.js';

const STEPS = [
  'くちびるを 軽く 閉じ、歯は 少し 離して、小さめの 声で『んー』。楽な 高さで 5秒（2回）。くちびるや 鼻の あたりが 軽く ひびく 感じが 目安',
  '『うー』と 小さめの 声で、低い 所から 楽に 出る 所まで ゆっくり 上げて、また 下げる（2回）。高い 所は 無理に のばさない。声が ひっくり返っても 大丈夫',
];

export function renderWarmup(root, params) {
  const next = params.get('next') || 'home';
  let index = 0;

  function show() {
    if (index >= STEPS.length) return showEnd();
    const advance = () => { index += 1; show(); };
    root.replaceChildren(
      heading('準備運動'),
      note(`${index + 1} / ${STEPS.length}`),
      note(STEPS[index]),
      // 声を出す前に読めるよう、安全の一言を手順ごとに出す
      safetyList(SAFETY_LINES),
      button('つぎへ', advance),
      button('とばす', advance),
    );
  }

  function showEnd() {
    root.replaceChildren(
      heading('準備運動'),
      safetyList(SAFETY_LINES),
      button('練習へ', () => go(next)),
    );
  }

  show();
}
