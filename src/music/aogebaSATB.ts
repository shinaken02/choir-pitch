// サンプル曲：「仰げば尊し」混声四部（ソプラノ／アルト／テナー／バス）
// -----------------------------------------------------------------------------
// ※「仰げば尊し」は明治期の唱歌で、メロディは著作権が切れています（パブリックドメイン）。
// ※ ソプラノは主旋律、アルト／テナー／バスは **パブリックドメインの旋律に基づく簡易な編曲（一例）** です。
//   お手持ちの楽譜と違う場合は、下の CHORALE（[拍数, ソプラノ, アルト, テナー, バス]）を
//   書き換えるだけで差し替えられます。"rest" は休符。音名は "C4"/"G3" 形式（A4=440Hz）。
//
// ヘ調ではなくハ長調・4/4拍子で、全声部が同じリズムで動くホモフォニー編曲にしています
// （各パートの音程練習がしやすいように）。

import { noteNameToMidi } from "./noteUtils";

export const TEMPO_BPM = 92;

export type PartId = "soprano" | "alto" | "tenor" | "bass";

export const PART_LABELS: Record<PartId, string> = {
  soprano: "ソプラノ",
  alto: "アルト",
  tenor: "テナー",
  bass: "バス",
};

export const PART_ORDER: PartId[] = ["soprano", "alto", "tenor", "bass"];

// [拍数, ソプラノ, アルト, テナー, バス]
const CHORALE: Array<[number, string, string, string, string]> = [
  // 仰げば尊し
  [1, "G4", "E4", "C4", "C3"],
  [1, "C5", "G4", "E4", "C3"],
  [1, "C5", "G4", "E4", "C3"],
  [1, "B4", "G4", "D4", "G3"],
  [2, "C5", "E4", "G3", "C3"],
  [1, "D5", "G4", "B3", "G3"],
  // わが師の恩
  [1, "E5", "G4", "C4", "C3"],
  [1, "D5", "G4", "B3", "G3"],
  [1, "C5", "E4", "G3", "C3"],
  [1, "B4", "G4", "D4", "G3"],
  [1, "A4", "F4", "C4", "F3"],
  [2, "G4", "E4", "C4", "C3"],
  [1, "rest", "rest", "rest", "rest"],
  // 教えの庭にも
  [1, "E5", "G4", "C4", "C3"],
  [1, "E5", "G4", "C4", "C3"],
  [1, "D5", "G4", "B3", "G3"],
  [1, "C5", "E4", "G3", "C3"],
  [2, "D5", "B4", "G4", "G3"],
  // はや幾年
  [1, "E5", "C5", "G4", "C3"],
  [1, "G5", "C5", "E4", "C3"],
  [1, "E5", "C5", "G4", "C3"],
  [1, "D5", "G4", "B3", "G3"],
  [1, "C5", "E4", "G3", "C3"],
  [2, "G4", "E4", "C4", "C3"],
  [1, "rest", "rest", "rest", "rest"],
];

// 各 CHORALE 行に対応する歌詞（全声部共通）。"" は休符＝歌詞の行の区切りに使う。
// ※歌詞の文字割りは、上の簡易メロディに合わせた一例です（"わが"/"おん" などは1音にまとめています）。
const LYRICS: string[] = [
  // 仰げば尊し　我が師の恩
  "あ",
  "お",
  "げ",
  "ば",
  "と",
  "う",
  "と",
  "し",
  "わが",
  "し",
  "の",
  "おん",
  "", // 休符
  // 教えの庭にも　はや幾年
  "お",
  "し",
  "え",
  "の",
  "に",
  "わ",
  "に",
  "も",
  "はや",
  "いく",
  "とせ",
  "", // 休符
];

export interface TimedNote {
  name: string; // 音名（Tone.js 再生用）
  midi: number; // MIDIノート番号（描画用）
  startSec: number; // 開始時刻（秒）
  durSec: number; // 長さ（秒）
}

export interface LyricChunk {
  text: string;
  startSec: number; // 曲頭からの開始時刻（秒）
  durSec: number;
}

export interface Part {
  id: PartId;
  label: string;
  notes: TimedNote[];
}

function buildPart(
  chorale: typeof CHORALE,
  index: 1 | 2 | 3 | 4,
  bpm: number,
): TimedNote[] {
  const secPerBeat = 60 / bpm;
  const notes: TimedNote[] = [];
  let cursorSec = 0;
  for (const row of chorale) {
    const beats = row[0];
    const name = row[index];
    const durSec = beats * secPerBeat;
    if (name !== "rest") {
      notes.push({ name, midi: noteNameToMidi(name), startSec: cursorSec, durSec });
    }
    cursorSec += durSec;
  }
  return notes;
}

export const AOGEBA_PARTS: Record<PartId, Part> = {
  soprano: { id: "soprano", label: PART_LABELS.soprano, notes: buildPart(CHORALE, 1, TEMPO_BPM) },
  alto: { id: "alto", label: PART_LABELS.alto, notes: buildPart(CHORALE, 2, TEMPO_BPM) },
  tenor: { id: "tenor", label: PART_LABELS.tenor, notes: buildPart(CHORALE, 3, TEMPO_BPM) },
  bass: { id: "bass", label: PART_LABELS.bass, notes: buildPart(CHORALE, 4, TEMPO_BPM) },
};

export const AOGEBA_DURATION_SEC = AOGEBA_PARTS.soprano.notes.reduce(
  (max, n) => Math.max(max, n.startSec + n.durSec),
  0,
);

// 歌詞を「行（休符で区切る）」ごとにまとめ、各文字に開始時刻を付ける。
function buildLyricLines(
  chorale: typeof CHORALE,
  lyrics: string[],
  bpm: number,
): LyricChunk[][] {
  const secPerBeat = 60 / bpm;
  const lines: LyricChunk[][] = [];
  let current: LyricChunk[] = [];
  let cursorSec = 0;
  chorale.forEach((row, i) => {
    const durSec = row[0] * secPerBeat;
    const text = lyrics[i] ?? "";
    if (text === "") {
      if (current.length) {
        lines.push(current);
        current = [];
      }
    } else {
      current.push({ text, startSec: cursorSec, durSec });
    }
    cursorSec += durSec;
  });
  if (current.length) lines.push(current);
  return lines;
}

export const AOGEBA_LYRIC_LINES = buildLyricLines(CHORALE, LYRICS, TEMPO_BPM);
