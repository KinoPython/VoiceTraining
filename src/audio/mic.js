// マイクを開き、声の高さを1コマごとに測る。声はスマホの中だけで処理し、外に送らない。
import { detectPitch, createSmoother } from '../logic/pitch.js';
import { getAudioContext } from './tone.js';

const FFT_SIZE = 2048;
// iPhone は audio/mp4、そのほかは webm が録れる。使えるものを選ぶ
const RECORD_TYPES = ['audio/mp4', 'audio/webm'];

function pickRecordType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  return RECORD_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

// 失敗の理由を、画面で出し分けやすい4種類にまとめる
function failureReason(error) {
  if (error && error.name === 'NotAllowedError') return 'denied';
  if (error && error.name === 'NotFoundError') return 'nodevice';
  return 'other';
}

function createMic(stream, ctx) {
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  source.connect(analyser); // スピーカーにはつながない（ハウリング防止）
  const buffer = new Float32Array(analyser.fftSize);
  const smoother = createSmoother();

  let frameCallback = null;
  let rafId = null;
  let closed = false;
  let recorder = null;
  let chunks = [];
  const urls = [];

  function loop() {
    analyser.getFloatTimeDomainData(buffer);
    const midi = smoother.push(detectPitch(buffer, ctx.sampleRate));
    frameCallback(midi, performance.now());
    rafId = requestAnimationFrame(loop);
  }

  function startTake() {
    const type = pickRecordType();
    if (typeof MediaRecorder === 'undefined' || closed) return;
    chunks = [];
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.start();
  }

  // 録った声はメモリの中だけ。聞き直したら close で捨てる
  function stopTake() {
    if (!recorder) return Promise.resolve(null);
    const current = recorder;
    recorder = null;
    return new Promise((resolve) => {
      current.onstop = () => {
        const url = URL.createObjectURL(new Blob(chunks, { type: current.mimeType || pickRecordType() }));
        urls.push(url);
        resolve(url);
      };
      current.stop();
    });
  }

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('visibilitychange', onVisibility);
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    stream.getTracks().forEach((t) => t.stop()); // マイク使用中の表示を消す
    source.disconnect();
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.length = 0;
  }

  // 画面を隠したままマイクが開きっぱなしにならないよう、自分で閉じる
  function onVisibility() {
    if (document.visibilityState === 'hidden') close();
  }
  document.addEventListener('visibilitychange', onVisibility);

  return {
    onFrame(cb) {
      frameCallback = cb;
      if (rafId === null && !closed) rafId = requestAnimationFrame(loop);
    },
    startTake,
    stopTake,
    close,
  };
}

export async function openMic() {
  const media = navigator.mediaDevices;
  if (!media || !media.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) {
    return { ok: false, reason: 'unsupported' };
  }
  try {
    // iPhone のマナーモードで音が消えないように（対応している端末だけ）
    if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
    // 声の高さが変わらないよう、自動補正はすべて切る
    const stream = await media.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = getAudioContext();
    await ctx.resume();
    return { ok: true, mic: createMic(stream, ctx) };
  } catch (error) {
    return { ok: false, reason: failureReason(error) };
  }
}
