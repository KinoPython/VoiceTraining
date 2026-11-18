// 安全の画面。welcome 前でも見られる
import { go } from '../router.js';
import { button, heading, safetyList } from '../ui/components.js';
import { SAFETY_LINES } from '../data/copy.js';

export function renderSafety(root) {
  root.append(heading('安全の こと'), safetyList(SAFETY_LINES), button('ホームへ', () => go('home')));
}
