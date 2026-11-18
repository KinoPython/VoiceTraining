// 準備運動（1〜2分）。手順を1つずつ出し、「つぎへ」か「とばす」で進む
import { go } from '../router.js';
import { button, heading, note, safetyList } from '../ui/components.js';
import { SAFETY_LINES } from '../data/copy.js';

const STEPS = [
  '口を 閉じて『んー』と 楽な 高さで 5秒（2回）',
  '『うー』で 低い 所から ゆっくり 上げて 下げる（サイレン）（2回）',
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
