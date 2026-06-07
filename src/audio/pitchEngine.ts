// マイク入力からリアルタイムにピッチ（基本周波数）を取り出すエンジン。
// Web Audio API でマイク波形を取得し、pitchy（McLeod Pitch Method）で周波数を推定します。
// 音声は一切外部に送信されず、ブラウザ内だけで処理されます。

import { PitchDetector } from "pitchy";

export interface PitchSample {
  /** 推定周波数(Hz)。検出できない場合は 0 */
  freq: number;
  /** 推定の信頼度 0〜1（McLeod法のclarity）。低いほど不確か */
  clarity: number;
  /** 音量の目安（RMS）。無音・ノイズ判定に使う */
  rms: number;
}

export class PitchEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private detector: PitchDetector<Float32Array<ArrayBuffer>> | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private stream: MediaStream | null = null;

  get sampleRate(): number {
    return this.audioCtx?.sampleRate ?? 44100;
  }

  get isRunning(): boolean {
    return this.audioCtx !== null;
  }

  async start(): Promise<void> {
    if (this.audioCtx) return;

    // 歌声解析では、ブラウザの自動補正（エコー除去・ノイズ抑制・自動ゲイン）が
    // ピッチを歪めることがあるため、できるだけ無効にしてもらう。
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    this.audioCtx = new AudioContext();
    // ブラウザによっては suspended で始まるので明示的に再開する。
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }

    const source = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    // バッファは小さめ（≒低レイテンシ）。2048サンプルで低音(〜80Hz程度)まで安定して検出できる。
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);

    this.buffer = new Float32Array(this.analyser.fftSize);
    this.detector = PitchDetector.forFloat32Array(this.analyser.fftSize);
    // この音量(dB)を下回るフレームはピッチ無しとして扱う。
    this.detector.minVolumeDecibels = -30;
  }

  /** 現在の1フレーム分のピッチを取得する。未起動なら null。 */
  read(): PitchSample | null {
    if (!this.analyser || !this.detector || !this.buffer || !this.audioCtx) {
      return null;
    }
    this.analyser.getFloatTimeDomainData(this.buffer);

    let sumSquares = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      sumSquares += this.buffer[i] * this.buffer[i];
    }
    const rms = Math.sqrt(sumSquares / this.buffer.length);

    const [freq, clarity] = this.detector.findPitch(
      this.buffer,
      this.audioCtx.sampleRate,
    );

    return { freq, clarity, rms };
  }

  async stop(): Promise<void> {
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.audioCtx) {
      await this.audioCtx.close();
    }
    this.audioCtx = null;
    this.analyser = null;
    this.detector = null;
    this.buffer = null;
    this.stream = null;
  }
}
