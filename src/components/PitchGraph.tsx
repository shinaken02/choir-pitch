// 縦軸＝音高、横軸＝時間 のスクロールグラフ。
//  - 背景にピアノロール風のガイド（鍵盤の段＋音名ラベル）を描く
//  - 歌った声のピッチを線で描画（カラオケのように右から左へ流れる）
//  - お手本モードでは、お手本の音符を横バーで先に表示し、声が合っていれば緑／ずれていれば赤

import { useEffect, useRef } from "react";
import { PitchEngine } from "../audio/pitchEngine";
import type { PitchSample } from "../audio/pitchEngine";
import { freqToMidiFloat, midiToNoteName } from "../music/noteUtils";
import type { TimedNote } from "../music/aogebaSATB";
import type { PitchReadout } from "../music/noteUtils";

// 表示する音域（MIDIノート番号）は props で受け取り、選んだパートに合わせて変えます。

// 横方向のスケール
const PIXELS_PER_SEC = 90;
const NOW_LINE_RATIO = 0.4; // 「今」の縦線をグラフ幅の40%の位置に置く
const LEFT_GUTTER = 44; // 左側の音名ラベル領域(px)
const HISTORY_SEC = 8; // 保持する声の履歴（秒）

// 検出を採用する閾値（歌声向けに調整）
const CLARITY_THRESHOLD = 0.9;
const RMS_THRESHOLD = 0.01;
const MATCH_TOLERANCE_SEMITONES = 0.7; // ±70centで「合っている」とみなす

interface VoicePoint {
  t: number; // performance.now() のタイムスタンプ(ms)
  midi: number | null; // 検出された音高（採用できないフレームは null）
  cents: number; // 最寄りの半音とのズレ（フリーモードの色分け用）
  matched: boolean | null; // お手本モードでお手本と合っているか
}

interface Props {
  engine: PitchEngine | null;
  running: boolean;
  /** お手本の音符（お手本モードのとき）。null ならフリーモード */
  targets: TimedNote[] | null;
  /** お手本の再生開始時刻（performance.now基準, ms）。再生中でなければ null */
  demoStartRef: React.MutableRefObject<number | null>;
  /** 表示音域（MIDIノート番号）の下限・上限 */
  midiMin: number;
  midiMax: number;
  /** 画面上部の数値表示を更新するためのコールバック */
  onReadout: (r: (PitchReadout & { clarity: number }) | null) => void;
}

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]); // C#,D#,F#,G#,A#

export function PitchGraph({
  engine,
  running,
  targets,
  demoStartRef,
  midiMin,
  midiMax,
  onReadout,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<VoicePoint[]>([]);
  const rafRef = useRef<number>(0);
  const lastReadoutAt = useRef<number>(0);

  // 最新の props を rAF ループ内から参照するための ref
  const stateRef = useRef({ engine, running, targets, midiMin, midiMax });
  stateRef.current = { engine, running, targets, midiMin, midiMax };

  // running が false になったら履歴をクリア
  useEffect(() => {
    if (!running) {
      pointsRef.current = [];
      onReadout(null);
    }
  }, [running, onReadout]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const loop = () => {
      const now = performance.now();
      const { engine, running, targets, midiMin, midiMax } = stateRef.current;
      const midiRange = midiMax - midiMin;
      const demoStart = demoStartRef.current;

      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const graphW = W - LEFT_GUTTER;
      const nowX = LEFT_GUTTER + graphW * NOW_LINE_RATIO;

      const yForMidi = (m: number) =>
        H - ((m - midiMin) / midiRange) * H;
      const xForTime = (t: number) => nowX + ((t - now) * PIXELS_PER_SEC) / 1000;

      // ---- 1フレーム分のピッチ取得 ----
      if (engine && running) {
        const sample = engine.read();
        const vp = evaluateSample(sample, now, demoStart, targets);
        pointsRef.current.push(vp);

        // 数値表示は重いので約12fpsに間引く
        if (now - lastReadoutAt.current > 80) {
          lastReadoutAt.current = now;
          if (vp.midi !== null && sample) {
            const nearestMidi = Math.round(vp.midi);
            onReadout({
              freq: sample.freq,
              midiFloat: vp.midi,
              nearestMidi,
              noteName: midiToNoteName(nearestMidi),
              cents: Math.round((vp.midi - nearestMidi) * 100),
              clarity: sample.clarity,
            });
          } else {
            onReadout(null);
          }
        }
      }

      // 古い履歴を捨てる
      const cutoff = now - HISTORY_SEC * 1000;
      const pts = pointsRef.current;
      while (pts.length && pts[0].t < cutoff) pts.shift();

      // ---- 描画 ----
      ctx.clearRect(0, 0, W, H);
      drawBackground(ctx, W, H, yForMidi, midiMin, midiMax);
      if (targets && demoStart !== null) {
        drawTargets(ctx, targets, demoStart, xForTime, yForMidi, W, H, midiMin, midiMax);
      }
      drawVoice(ctx, pts, xForTime, yForMidi, !!targets);
      drawNowLine(ctx, nowX, H);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [demoStartRef, onReadout]);

  return <canvas ref={canvasRef} className="pitch-canvas" />;
}

// 1フレームのサンプルを評価して VoicePoint にする（閾値・お手本判定・オクターブ補正）
function evaluateSample(
  sample: PitchSample | null,
  now: number,
  demoStart: number | null,
  targets: TimedNote[] | null,
): VoicePoint {
  if (
    !sample ||
    sample.clarity < CLARITY_THRESHOLD ||
    sample.rms < RMS_THRESHOLD ||
    sample.freq < 60 ||
    sample.freq > 1600
  ) {
    return { t: now, midi: null, cents: 0, matched: null };
  }

  const midiFloat = freqToMidiFloat(sample.freq);
  const nearest = Math.round(midiFloat);
  const cents = (midiFloat - nearest) * 100;

  // お手本モードなら、その瞬間のお手本の音と比べる
  let matched: boolean | null = null;
  if (targets && demoStart !== null) {
    const scoreSec = (now - demoStart) / 1000;
    const active = targets.find(
      (n) => scoreSec >= n.startSec && scoreSec < n.startSec + n.durSec,
    );
    if (active) {
      // 倍音による1オクターブ誤検出に軽く対処：お手本に対して
      // ±1オクターブずらした方が近ければ、そちらを採用して比較する。
      const diff = midiFloat - active.midi;
      let corrected = midiFloat;
      if (Math.abs(diff) > 6) {
        const octaves = Math.round(diff / 12);
        corrected = midiFloat - octaves * 12;
      }
      matched =
        Math.abs(corrected - active.midi) <= MATCH_TOLERANCE_SEMITONES;
      return { t: now, midi: corrected, cents, matched };
    }
  }

  return { t: now, midi: midiFloat, cents, matched };
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  yForMidi: (m: number) => number,
  midiMin: number,
  midiMax: number,
) {
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, W, H);

  ctx.font = "11px system-ui, sans-serif";
  ctx.textBaseline = "middle";

  for (let m = midiMin; m <= midiMax; m++) {
    const yTop = yForMidi(m + 0.5);
    const yBot = yForMidi(m - 0.5);
    const isBlack = BLACK_KEYS.has(((m % 12) + 12) % 12);
    ctx.fillStyle = isBlack ? "#161b22" : "#1b222c";
    ctx.fillRect(LEFT_GUTTER, yTop, W - LEFT_GUTTER, yBot - yTop);

    // C の段に区切り線とラベルを目立たせる
    const pitchClass = ((m % 12) + 12) % 12;
    if (pitchClass === 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(LEFT_GUTTER, yBot);
      ctx.lineTo(W, yBot);
      ctx.stroke();
    }

    // 左の音名ラベル（白鍵のみ表示してすっきりさせる）
    if (!isBlack) {
      ctx.fillStyle = pitchClass === 0 ? "#e6edf3" : "#7d8590";
      ctx.fillText(midiToNoteName(m), 6, (yTop + yBot) / 2);
    }
  }

  // 鍵盤エリアと左ラベルの境界線
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath();
  ctx.moveTo(LEFT_GUTTER, 0);
  ctx.lineTo(LEFT_GUTTER, H);
  ctx.stroke();
}

function drawTargets(
  ctx: CanvasRenderingContext2D,
  targets: TimedNote[],
  demoStart: number,
  xForTime: (t: number) => number,
  yForMidi: (m: number) => number,
  W: number,
  H: number,
  midiMin: number,
  midiMax: number,
) {
  const bandH = Math.max(6, (H / (midiMax - midiMin)) * 0.7);
  for (const n of targets) {
    const x1 = xForTime(demoStart + n.startSec * 1000);
    const x2 = xForTime(demoStart + (n.startSec + n.durSec) * 1000);
    if (x2 < LEFT_GUTTER || x1 > W) continue; // 画面外
    const y = yForMidi(n.midi);
    ctx.fillStyle = "rgba(88,166,255,0.55)";
    roundRect(ctx, x1, y - bandH / 2, Math.max(2, x2 - x1 - 2), bandH, 3);
    ctx.fill();
  }
}

function drawVoice(
  ctx: CanvasRenderingContext2D,
  pts: VoicePoint[],
  xForTime: (t: number) => number,
  yForMidi: (m: number) => number,
  demoMode: boolean,
) {
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  let prev: VoicePoint | null = null;
  for (const p of pts) {
    if (p.midi === null) {
      prev = null;
      continue;
    }
    const x = xForTime(p.t);
    const y = yForMidi(p.midi);
    if (prev && prev.midi !== null && p.t - prev.t < 120) {
      ctx.strokeStyle = colorFor(p, demoMode);
      ctx.beginPath();
      ctx.moveTo(xForTime(prev.t), yForMidi(prev.midi));
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    prev = p;
  }

  // 現在地に丸印
  const last = pts[pts.length - 1];
  if (last && last.midi !== null) {
    ctx.fillStyle = colorFor(last, demoMode);
    ctx.beginPath();
    ctx.arc(xForTime(last.t), yForMidi(last.midi), 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function colorFor(p: VoicePoint, demoMode: boolean): string {
  if (demoMode && p.matched !== null) {
    return p.matched ? "#3fb950" : "#f85149"; // 合っていれば緑／ずれていれば赤
  }
  // フリーモード：最寄りの半音とのズレで色分け
  const a = Math.abs(p.cents);
  if (a < 15) return "#3fb950";
  if (a < 35) return "#d29922";
  return "#f85149";
}

function drawNowLine(ctx: CanvasRenderingContext2D, nowX: number, H: number) {
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(nowX, 0);
  ctx.lineTo(nowX, H);
  ctx.stroke();
  ctx.setLineDash([]);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
