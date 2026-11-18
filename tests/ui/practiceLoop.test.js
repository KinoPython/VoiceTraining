import { describe, test, expect, vi } from 'vitest';
import { createMicSession } from '../../src/ui/practiceLoop.js';

// 偽のマイク：閉じたときの知らせをテストから出せる
function makeMic() {
  let closed = null;
  const mic = {
    onFrame: vi.fn(),
    onClosed: (cb) => { closed = cb; },
    close: vi.fn(() => closed?.('closed')),
    fireClosed: (reason) => closed?.(reason),
  };
  return mic;
}

// 呼ぶたびに新しいマイクを返す openMic。resolveAll() まで待たせる
function makeSlowOpen() {
  const mics = [];
  const waiting = [];
  const openMic = vi.fn(() => new Promise((resolve) => {
    const mic = makeMic();
    mics.push(mic);
    waiting.push(() => resolve({ ok: true, mic }));
  }));
  return { openMic, mics, resolveAll: () => waiting.splice(0).forEach((r) => r()) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createMicSession', () => {
  test('開いている途中の2回目の open() は無視する（連打対策）', async () => {
    const slow = makeSlowOpen();
    const onReady = vi.fn();
    const session = createMicSession({ openMic: slow.openMic, root: document.createElement('div'), onReady, onHidden: vi.fn() });
    const a = session.open();
    const b = session.open();
    slow.resolveAll();
    await Promise.all([a, b]);
    expect(slow.openMic).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(session.mic).toBe(slow.mics[0]);
  });

  test('close() のあとに遅れて開いたマイクは、すぐ閉じる', async () => {
    const slow = makeSlowOpen();
    const onReady = vi.fn();
    const session = createMicSession({ openMic: slow.openMic, root: document.createElement('div'), onReady, onHidden: vi.fn() });
    const p = session.open();
    session.close();
    slow.resolveAll();
    await p;
    expect(slow.mics[0].close).toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
    expect(session.mic).toBeNull();
  });

  test('onHidden は画面を隠して閉じたとき（hidden）だけ呼ぶ', async () => {
    const slow = makeSlowOpen();
    const onHidden = vi.fn();
    const session = createMicSession({ openMic: slow.openMic, root: document.createElement('div'), onReady: vi.fn(), onHidden });
    const p = session.open();
    slow.resolveAll();
    await p;
    slow.mics[0].fireClosed('closed');
    expect(onHidden).not.toHaveBeenCalled();
    slow.mics[0].fireClosed('hidden');
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(session.mic).toBeNull();
  });

  test('release() はマイクだけ閉じ、あとで open() し直せる', async () => {
    const slow = makeSlowOpen();
    const onHidden = vi.fn();
    const session = createMicSession({ openMic: slow.openMic, root: document.createElement('div'), onReady: vi.fn(), onHidden });
    let p = session.open();
    slow.resolveAll();
    await p;
    session.release();
    expect(slow.mics[0].close).toHaveBeenCalled();
    expect(session.mic).toBeNull();
    expect(onHidden).not.toHaveBeenCalled();
    p = session.open();
    slow.resolveAll();
    await p;
    await flush();
    expect(slow.openMic).toHaveBeenCalledTimes(2);
    expect(session.mic).toBe(slow.mics[1]);
  });
});
