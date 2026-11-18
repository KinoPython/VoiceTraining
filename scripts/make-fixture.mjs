// e2e 用の偽マイク音声を作る：220Hz（A3 = MIDI 57）の正弦波 10秒、16bit 44.1kHz モノラル
// 実行: node scripts/make-fixture.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const RATE = 44100;
const SECONDS = 10;
const HZ = 220;
const AMPLITUDE = 0.5; // 割れない大きさで、無音判定（minRms）よりは十分大きく

// 音のデータ本体（16bit の符号つき整数）
function makeSamples() {
  const count = RATE * SECONDS;
  const data = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i += 1) {
    const value = Math.sin((2 * Math.PI * HZ * i) / RATE) * AMPLITUDE;
    data.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  return data;
}

// wav の頭（44バイトの決まった形）をつけて 1 つのファイルにする
function makeWav(data) {
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16); // fmt の長さ
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // モノラル
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28); // 1秒あたりのバイト数
  head.writeUInt16LE(2, 32); // 1サンプルのバイト数
  head.writeUInt16LE(16, 34); // ビット数
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

mkdirSync('e2e/fixtures', { recursive: true });
writeFileSync('e2e/fixtures/a3.wav', makeWav(makeSamples()));
console.log('e2e/fixtures/a3.wav を作りました');
