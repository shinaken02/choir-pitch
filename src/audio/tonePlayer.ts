// Tone.js を使った音の再生まわり。
//  - 基準音（チューニング用の単音）の鳴らし／止め
//  - お手本メロディの再生（スケジュール再生・停止）

import * as Tone from "tone";
import type { TimedNote } from "../music/aogebaSATB";

let audioStarted = false;

// ブラウザの制約で、最初のユーザー操作のタイミングで AudioContext を起動する必要がある。
async function ensureAudio(): Promise<void> {
  if (!audioStarted) {
    await Tone.start();
    audioStarted = true;
  }
}

// ---- 基準音（チューニング用の単音） ---------------------------------------
let refSynth: Tone.Synth | null = null;

export async function startRefTone(noteName: string): Promise<void> {
  await ensureAudio();
  if (!refSynth) {
    refSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.02, release: 0.3 },
    }).toDestination();
  }
  refSynth.triggerAttack(noteName);
}

export function stopRefTone(): void {
  refSynth?.triggerRelease();
}

// ---- お手本メロディ ---------------------------------------------------------
let melodySynth: Tone.PolySynth | null = null;

export interface MelodyHandle {
  stop: () => void;
}

/**
 * お手本メロディを再生する。
 * @param onEnd 再生が最後まで終わったときに呼ばれる
 * @returns 停止用ハンドル
 */
export async function playMelody(
  notes: TimedNote[],
  onEnd: () => void,
): Promise<MelodyHandle> {
  await ensureAudio();
  if (!melodySynth) {
    melodySynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.2 },
    }).toDestination();
    melodySynth.volume.value = -6;
  }

  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();
  transport.position = 0;

  let endSec = 0;
  for (const n of notes) {
    transport.schedule((time) => {
      melodySynth!.triggerAttackRelease(n.name, n.durSec, time);
    }, n.startSec);
    endSec = Math.max(endSec, n.startSec + n.durSec);
  }

  // 最後の音が鳴り終わったら終了通知
  transport.schedule(() => {
    onEnd();
    transport.stop();
    transport.cancel();
  }, endSec + 0.3);

  transport.start();

  return {
    stop: () => {
      transport.stop();
      transport.cancel();
      melodySynth?.releaseAll();
    },
  };
}
