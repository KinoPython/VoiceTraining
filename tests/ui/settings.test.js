import { describe, test, expect, beforeEach, vi } from 'vitest';
import { register, start, resetRoutes } from '../../src/router.js';
import { renderSettings, downloadFile } from '../../src/screens/settings.js';
import { exportBackup, loadState } from '../../src/storage/store.js';
import { findBanned } from '../../src/logic/words.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const byLabel = (root, label) => [...root.querySelectorAll('button')].find((b) => b.textContent === label);
const entry = { date: '2026-11-18', stage: 1, tries: 5, successes: 3, value: 2 };

function seed(patch) {
  const base = { version: 1, range: null, levels: { s1: 0, s3: 0, s4: 0, s5: 0 }, history: [], welcomed: true };
  localStorage.setItem('koetore.v1', JSON.stringify({ ...base, ...patch }));
}
function open(deps = { download: vi.fn() }) {
  const root = document.createElement('div');
  renderSettings(root, {}, deps);
  return root;
}
async function pick(root, content) {
  const input = root.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { value: [{ text: () => Promise.resolve(content) }], configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle();
}

describe('せってい', () => {
  beforeEach(() => localStorage.clear());

  test('書き出しは日付つきのファイル名で、いまの記録を渡す', () => {
    seed({ history: [entry] });
    const download = vi.fn();
    const root = open({ download });
    byLabel(root, '記録を ファイルに 書き出す').click();
    const [name, text] = download.mock.calls[0];
    expect(name).toMatch(/^koetore-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(text).toBe(exportBackup());
  });

  test('書き出したものを読み込むと同じ中身になる', async () => {
    seed({ history: [entry] });
    const text = exportBackup();
    localStorage.clear();
    const root = open();
    await pick(root, text);
    expect(root.textContent).toContain('読み込みました');
    expect(loadState().history).toEqual([entry]);
  });

  test('こわれたファイルは読み込めず、記録は変わらない', async () => {
    seed({ history: [entry] });
    const root = open();
    await pick(root, '{こわれた');
    expect(root.textContent).toContain('この ファイルは 読み込めません');
    expect(loadState().history).toEqual([entry]);
  });

  test('ファイル選択は json だけ', () => {
    expect(open().querySelector('input[type=file]').accept).toBe('application/json,.json');
  });

  test('開いたとき一度だけ保存のお願いをする', () => {
    const persist = vi.fn();
    navigator.storage = { persist };
    open();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  test('案内・クレジット・測りなおしのボタンがある', async () => {
    resetRoutes();
    history.replaceState(null, '', location.pathname);
    register('settings', (r) => renderSettings(r, {}, { download: vi.fn() }));
    register('stage2', (r) => { r.textContent = '段2'; });
    const root = document.createElement('div');
    location.hash = '#settings';
    await start(root);
    await settle();
    expect(root.textContent).toContain('ホーム画面に 追加すると、記録が 消えにくく なります');
    expect(root.textContent).toContain('pitchy（声の 高さの 計算） — MIT License');
    byLabel(root, '声の 地図を 測りなおす').click();
    await settle();
    expect(root.textContent).toBe('段2');
  });

  test('禁止語と「連続」が無い', () => {
    const t = open().textContent;
    expect(findBanned(t)).toEqual([]);
    expect(t).not.toContain('連続');
  });
});

describe('downloadFile', () => {
  test('body に付けてクリックし、外して、URL は時間がたってから捨てる', () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    let seen = null;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      seen = { attached: document.body.contains(this), name: this.download, href: this.href };
    });
    downloadFile('koetore-backup-2026-11-18.json', '{}');
    expect(seen).toEqual({ attached: true, name: 'koetore-backup-2026-11-18.json', href: 'blob:x' });
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    click.mockRestore();
    vi.useRealTimers();
  });
});
