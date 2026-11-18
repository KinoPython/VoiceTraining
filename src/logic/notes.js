// 音の高さの計算。MIDI番号（ラ=69、ド=60）を共通のものさしにする。

// 440Hz のラを 69 番とし、1オクターブ（2倍）で 12 番上がる
export function hzToMidi(hz) {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 歌った音が目標より何セント高いか（半音 = 100セント。低いならマイナス）
export function centsOff(sungMidi, targetMidi) {
  return (sungMidi - targetMidi) * 100;
}

// 男声と女声などで、1オクターブ違う音を同じ音として見られるように
// −600 以上 600 未満にたたむ。+ 0 は -0 を 0 にするため
export function foldOctave(cents) {
  const octaveShift = Math.round(cents / 1200) + 0;
  return { cents: cents - octaveShift * 1200, octaveShift };
}

const NAMES = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'];

// 60 → 「ド4」（ピアノの真ん中のド）。小数は四捨五入して近い音にする
export function noteLabel(midi) {
  const n = Math.round(midi);
  const octave = Math.floor(n / 12) - 1;
  return NAMES[((n % 12) + 12) % 12] + octave;
}

// 「ドから半音いくつ上か」を言葉にする（ドを基準にすると初心者にも伝わりやすい）
export function gapLabel(semitones) {
  if (semitones === 12) return 'ドと 上の ド';
  return 'ドと ' + NAMES[semitones];
}
