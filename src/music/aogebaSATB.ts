// サンプル曲：「仰げば尊し」混声四部（ソプラノ／アルト／テナー／バス）
// -----------------------------------------------------------------------------
// 添付の合唱譜（"Song for the Close of School" / 仰げば尊し, T.H.Brosnan, 1884）に合わせて、
// ホ長調（♯4つ）・6/8拍子で採譜しています。歌詞は第1連の前半のみ：
//   1行目：仰げば尊し　我が師の恩
//   2行目：教えの庭にも　はや幾年
//
// ※「仰げば尊し」は明治期の唱歌で、著作権は切れています（パブリックドメイン）。
// ※ ソプラノは主旋律を採譜。アルト／テナー／バスは添付譜の音域に合わせた和声付け（一例）です。
// ※ 全声部が同じリズムで動くホモフォニー（賛美歌スタイル）にしています。
//   音を直したいときは下の CHORALE（[拍数, ソプラノ, アルト, テナー, バス]）を書き換えてください。
//   "rest"=休符。音名は "E5"/"F#5"/"D#4" 形式（A4=440Hz）。拍数は4分音符=1（8分音符=0.5）。

import { noteNameToMidi } from "./noteUtils";

// 6/8 のゆったりした速さ（付点4分音符 ≒ 56）。
export const TEMPO_BPM = 84;

export type PartId = "soprano" | "alto" | "tenor" | "bass";

export const PART_LABELS: Record<PartId, string> = {
  soprano: "ソプラノ",
  alto: "アルト",
  tenor: "テナー",
  bass: "バス",
};

export const PART_ORDER: PartId[] = ["soprano", "alto", "tenor", "bass"];

// [拍数, ソプラノ, アルト, テナー, バス]　拍数: 8分=0.5, 4分=1, 付点4分=1.5, 付点2分=3
const CHORALE: Array<[number, string, string, string, string]> = [
  // --- 1行目：仰げば尊し　我が師の恩 ---
  [0.5, "B4", "G#4", "E4", "E3"], // あ（アウフタクト）
  [1.0, "E5", "B4", "G#4", "E3"], // お
  [0.5, "E5", "B4", "G#4", "E3"], // げ
  [1.0, "E5", "B4", "G#4", "E3"], // ば
  [0.5, "F#5", "B4", "D#4", "B3"], // と
  [1.0, "G#5", "B4", "G#4", "E3"], // う
  [0.5, "F#5", "B4", "D#4", "B3"], // と
  [1.0, "E5", "B4", "G#4", "E3"], // し
  [0.5, "E5", "B4", "G#4", "E3"], // わ
  [1.0, "F#5", "B4", "D#4", "B3"], // が
  [0.5, "G#5", "B4", "G#4", "E3"], // し
  [1.0, "F#5", "B4", "D#4", "B3"], // の
  [0.5, "E5", "B4", "G#4", "E3"], // お
  [3.0, "E5", "G#4", "B3", "E3"], // ん（のばす）
  [1.5, "rest", "rest", "rest", "rest"],
  // --- 2行目：教えの庭にも　はや幾年 ---
  [0.5, "B4", "G#4", "E4", "E3"], // お
  [1.0, "E5", "B4", "G#4", "E3"], // し
  [0.5, "E5", "B4", "G#4", "E3"], // え
  [1.0, "E5", "B4", "G#4", "E3"], // の
  [0.5, "F#5", "B4", "D#4", "B3"], // に
  [1.0, "G#5", "B4", "G#4", "E3"], // わ
  [0.5, "F#5", "B4", "D#4", "B3"], // に
  [1.0, "E5", "B4", "G#4", "E3"], // も
  [0.5, "E5", "B4", "G#4", "E3"], // は
  [1.0, "F#5", "B4", "D#4", "B3"], // や
  [0.5, "G#5", "B4", "G#4", "E3"], // い
  [1.0, "F#5", "B4", "D#4", "B3"], // く
  [0.5, "E5", "B4", "G#4", "E3"], // と
  [3.0, "E5", "G#4", "B3", "E3"], // せ（のばす）
  [1.5, "rest", "rest", "rest", "rest"],
];

// 各 CHORALE 行に対応する歌詞（全声部共通）。"" は休符＝歌詞の行の区切り。
const LYRICS: string[] = [
  // 仰げば尊し　我が師の恩
  "あ", "お", "げ", "ば", "と", "う", "と", "し", "わ", "が", "し", "の", "お", "ん", "",
  // 教えの庭にも　はや幾年
  "お", "し", "え", "の", "に", "わ", "に", "も", "は", "や", "い", "く", "と", "せ", "",
];

export interface TimedNote {
  name: string; // 音名（Tone.js 再生用）
  midi: number; // MIDIノート番号（描画用）
  startSec: number; // 開始時刻（秒）
  durSec: number; // 長さ（秒）
}

export interface Part {
  id: PartId;
  label: string;
  notes: TimedNote[];
}

export interface LyricChunk {
  text: string;
  startSec: number; // 曲頭からの開始時刻（秒）
  durSec: number;
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
