// マイクを開き、声の高さを1コマごとに測る。声はスマホの中だけで処理し、外に送らない。
import { detectPitch, createSmoother } from '../logic/pitch.js';
import { getAudioContext, setAudioSessionType, setMicActive } from './tone.js';

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
  let closedCallback = null;
  let rafId = null;
  let closed = false;
  let recorder = null;
  let chunks = [];
  const urls = [];

  function loop() {
    analyser.getFloatTimeDomainData(buffer);
    const midi = smoother.push(detectPitch(buffer, ctx.sampleRate));
    frameCallback(midi, performance.now());
    // 受け取った側が close() を呼んだら、次のコマは予約しない
    if (!closed) rafId = requestAnimationFrame(loop);
  }

  // 録音を、結果を使わずに止める（途中で閉じたとき・録り直したとき用）
  function discardRecorder() {
    const current = recorder;
    recorder = null;
    if (!current) return;
    current.ondataavailable = null;
    current.onstop = null;
    try {
      if (current.state !== 'inactive') current.stop();
    } catch {
      // すでに止まっているなら何もしなくてよい
    }
  }

  function startTake() {
    if (typeof MediaRecorder === 'undefined' || closed) return;
    discardRecorder(); // 録音中にもう一度呼ばれたら、前のものは捨てる
    const type = pickRecordType();
    chunks = [];
    try {
      recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.start();
    } catch {
      recorder = null; // 録音できない端末。録音なしで続ける
    }
  }

  // 録った声はメモリの中だけ。聞き直したら close で捨てる
  function stopTake() {
    const current = recorder;
    if (!current || closed || current.state === 'inactive') {
      recorder = null;
      return Promise.resolve(null);
    }
    recorder = null;
    return new Promise((resolve) => {
      current.onstop = () => {
        if (closed) return resolve(null);
        const url = URL.createObjectURL(new Blob(chunks, { type: current.mimeType || pickRecordType() }));
        urls.push(url);
        resolve(url);
      };
      try {
        current.stop();
      } catch {
        resolve(null);
      }
    });
  }

  function close(reason = 'closed') {
    if (closed) return;
    closed = true;
    document.removeEventListener('visibilitychange', onVisibility);
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    discardRecorder();
    stream.getTracks().forEach((t) => t.stop()); // マイク使用中の表示を消す
    source.disconnect();
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.length = 0;
    // 録音用の音の出し方のままだと、iPhone の上の表示などが残る。音だけの形に戻す
    setAudioSessionType('playback');
    setMicActive(false); // 閉じたあとは、お手本のあとで play-and-record に戻さない
    if (closedCallback) closedCallback(reason);
  }

  // 画面を隠したままマイクが開きっぱなしにならないよう、自分で閉じる
  function onVisibility() {
    if (document.visibilityState === 'hidden') close('hidden');
  }
  document.addEventListener('visibilitychange', onVisibility);

  return {
    onFrame(cb) {
      frameCallback = cb;
      if (rafId === null && !closed) rafId = requestAnimationFrame(loop);
    },
    // 閉じたときに一度だけ呼ばれる。画面を隠して自動で閉じたときは reason が hidden
    onClosed(cb) {
      closedCallback = cb;
    },
    startTake,
    stopTake,
    close: () => close('closed'),
  };
}

export async function openMic() {
  const media = navigator.mediaDevices;
  if (!media || !media.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) {
    return { ok: false, reason: 'unsupported' };
  }
  let stream = null;
  try {
    // iPhone のマナーモードで音が消えないように（対応している端末だけ）
    setAudioSessionType('play-and-record');
    // タップの直後のうちに作る（許可ダイアログを待つ間にタップ扱いが切れるため）
    const ctx = getAudioContext();
    // 声の高さが変わらないよう、自動補正はすべて切る
    stream = await media.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    if (ctx.state !== 'running') await ctx.resume();
    const mic = createMic(stream, ctx);
    setMicActive(true); // お手本のあと、歌う間は play-and-record に戻してもらう
    return { ok: true, mic };
  } catch (error) {
    // 途中で失敗してもマイクを開けっぱなしにしない
    if (stream) stream.getTracks().forEach((t) => t.stop());
    return { ok: false, reason: failureReason(error) };
  }
}
