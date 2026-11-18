import { describe, test, expect } from 'vitest';
import { renderMicGuide } from '../../src/ui/micGuide.js';

function guide(reason) {
  const root = document.createElement('div');
  renderMicGuide(root, reason);
  return root;
}

describe('renderMicGuide', () => {
  test('denied は設定の手順を出す', () => {
    const text = guide('denied').textContent;
    expect(text).toContain('設定');
    expect(text).toContain('マイク');
    expect(text).toContain('許可');
  });

  test('nodevice はつなぐ案内', () => {
    expect(guide('nodevice').textContent).toContain('イヤホンの マイクなどを つないで ください。');
  });

  test.each(['unsupported', 'other'])('%s は Safari の案内', (reason) => {
    expect(guide(reason).textContent).toContain('iPhone の Safari で 開いて ください。');
  });

  test('どれにも「ホームへ」がある', () => {
    for (const r of ['denied', 'nodevice', 'unsupported', 'other']) {
      expect([...guide(r).querySelectorAll('button')].some((b) => b.textContent === 'ホームへ')).toBe(true);
    }
  });
});
