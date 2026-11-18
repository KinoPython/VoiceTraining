import { describe, test, expect } from 'vitest';
import { createHoldJudge } from '../../src/logic/hold.js';

// 16ms ごとに update を呼ぶ。durationMs ぶん（少し超えるまで）続け、最後の結果と次の開始時刻を返す
function feed(judge, midi, durationMs, startMs = 0) {
  let result;
  const frames = Math.ceil(durationMs / 16) + 1;
  for (let i = 0; i < frames; i++) result = judge.update(midi, startMs + i * 16);
  return { result, nextMs: startMs + frames * 16 };
}

const make = (opts = {}) => createHoldJudge({ targetMidi: 60, toleranceCents: 100, ...opts });

describe('createHoldJudge', () => {
  test('帯の中に1000ms いたら done', () => {
    expect(feed(make(), 60.3, 1000).result.state).toBe('done');
  });

  test('900ms ではまだ inside で、insideMs は 900 前後', () => {
    const { result } = feed(make(), 60.3, 900);
    expect(result.state).toBe('inside');
    expect(result.insideMs).toBeGreaterThan(880);
    expect(result.insideMs).toBeLessThan(930);
  });

  test('帯の外は上なら high、下なら low', () => {
    expect(feed(make(), 61.5, 200).result.direction).toBe('high');
    expect(feed(make(), 58.5, 200).result.direction).toBe('low');
  });

  test('帯の中の direction は null、ちょうど端(100c)は帯の中', () => {
    expect(feed(make(), 60.3, 200).result.direction).toBeNull();
    expect(make().update(61, 0).state).toBe('inside');
  });

  test('短い切れ目(100ms)は切らない', () => {
    const j = make();
    let t = feed(j, 60.3, 500).nextMs;
    t = feed(j, null, 100, t).nextMs;
    expect(feed(j, 60.3, 500, t).result.state).toBe('done');
  });

  test('長い切れ目(300ms)は 0 に戻す', () => {
    const j = make();
    let t = feed(j, 60.3, 500).nextMs;
    t = feed(j, null, 300, t).nextMs;
    expect(feed(j, 60.3, 500, t).result.state).not.toBe('done');
  });

  test('帯から出たら 0 に戻る', () => {
    const j = make();
    let t = feed(j, 60.3, 800).nextMs;
    t = feed(j, 61.8, 16, t).nextMs;
    const { result } = feed(j, 60.3, 500, t);
    expect(result.state).toBe('inside');
    expect(result.insideMs).toBeLessThan(550);
  });

  test('1フレームだけ帯の外に出ても切れる', () => {
    const j = make();
    let t = feed(j, 60.3, 600).nextMs;
    j.update(61.8, t);
    expect(feed(j, 60.3, 500, t + 16).result.state).not.toBe('done');
  });

  test('声が無い(null)ばかりなら waiting のまま', () => {
    const { result } = feed(make(), null, 3000);
    expect(result.state).toBe('waiting');
    expect(result.direction).toBeNull();
    expect(result.insideMs).toBe(0);
  });

  test('allowOctave: 1オクターブ上でも done、octaveShift は 1', () => {
    const { result } = feed(make({ allowOctave: true }), 72.2, 1000);
    expect(result.state).toBe('done');
    expect(result.octaveShift).toBe(1);
  });

  test('allowOctave なしでは1オクターブ上は done にならず high', () => {
    const { result } = feed(make(), 72.2, 1000);
    expect(result.state).not.toBe('done');
    expect(result.direction).toBe('high');
  });

  test('一度 done になったら、そのあと外れても done のまま', () => {
    const j = make();
    let { nextMs } = feed(j, 60.3, 1000);
    expect(j.update(65, nextMs).state).toBe('done');
    expect(j.update(null, nextMs + 16).state).toBe('done');
  });
});
