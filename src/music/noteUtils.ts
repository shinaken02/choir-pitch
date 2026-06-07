// 音名・周波数・MIDIノート番号の相互変換ユーティリティ。
// 基準ピッチは A4 = 440Hz（フェーズ3で 442Hz 等に変更できるよう関数に引数を残してあります）。

export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

// MIDIノート番号 → 周波数(Hz)
export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

// 周波数(Hz) → MIDIノート番号（小数。ぴったりの音から何半音ずれているかを含む）
export function freqToMidiFloat(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

// MIDIノート番号 → 音名表記（例: 69 → "A4"）
export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

// 音名表記（"A4", "C#5", "Bb4"）→ MIDIノート番号
export function noteNameToMidi(name: string): number {
  const m = name.trim().match(/^([A-Ga-g])(#|b|♯|♭)?(-?\d+)$/);
  if (!m) throw new Error(`音名の形式が不正です: ${name}`);
  const letter = m[1].toUpperCase();
  const accidental = m[2];
  const octave = parseInt(m[3], 10);
  const baseMap: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  let semitone = baseMap[letter];
  if (accidental === "#" || accidental === "♯") semitone += 1;
  if (accidental === "b" || accidental === "♭") semitone -= 1;
  return (octave + 1) * 12 + semitone;
}

// 周波数から「いちばん近い音」とのズレ（セント）を返す。
// cents > 0 なら高い（♯方向）、< 0 なら低い（♭方向）。
export interface PitchReadout {
  freq: number;
  midiFloat: number;
  nearestMidi: number;
  noteName: string;
  cents: number;
}

export function analyzeFreq(freq: number, a4 = 440): PitchReadout {
  const midiFloat = freqToMidiFloat(freq, a4);
  const nearestMidi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - nearestMidi) * 100);
  return {
    freq,
    midiFloat,
    nearestMidi,
    noteName: midiToNoteName(nearestMidi),
    cents,
  };
}
