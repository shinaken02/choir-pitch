import { useCallback, useMemo, useRef, useState } from "react";
import { PitchEngine } from "./audio/pitchEngine";
import {
  playMelody,
  startRefTone,
  stopRefTone,
  type MelodyHandle,
} from "./audio/tonePlayer";
import { PitchGraph } from "./components/PitchGraph";
import { type PitchReadout } from "./music/noteUtils";
import {
  AOGEBA_PARTS,
  AOGEBA_DURATION_SEC,
  PART_ORDER,
  type PartId,
} from "./music/aogebaSATB";

type Mode = "free" | "demo";

// チューニング用の基準音の選択肢
const REF_NOTES = ["C3", "G3", "C4", "E4", "G4", "A4", "C5", "G5"];

export default function App() {
  const engineRef = useRef<PitchEngine | null>(null);
  const demoStartRef = useRef<number | null>(null);
  const melodyHandleRef = useRef<MelodyHandle | null>(null);

  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState<Mode>("free");
  const [part, setPart] = useState<PartId>("soprano");
  const [readout, setReadout] = useState<
    (PitchReadout & { clarity: number }) | null
  >(null);
  const [refNote, setRefNote] = useState("A4");
  const [refPlaying, setRefPlaying] = useState(false);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPart = AOGEBA_PARTS[part];

  // 選んだパートの音域に合わせて、グラフの表示範囲を決める。
  const range = useMemo(() => {
    const midis = selectedPart.notes.map((n) => n.midi);
    let lo = Math.min(...midis) - 3;
    let hi = Math.max(...midis) + 3;
    // 狭すぎると見づらいので最低2オクターブ確保
    if (hi - lo < 24) {
      const mid = (hi + lo) / 2;
      lo = mid - 12;
      hi = mid + 12;
    }
    return { min: Math.max(36, Math.floor(lo)), max: Math.min(96, Math.ceil(hi)) };
  }, [selectedPart]);

  const onReadout = useCallback(
    (r: (PitchReadout & { clarity: number }) | null) => setReadout(r),
    [],
  );

  const startMic = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(
          "このページではマイクを使えません。アドレスが「http://localhost:5173」になっているか確認してください。" +
            "「192.168…」などの番号のアドレスで開いていると、マイクが使えません（localhost で開き直してください）。",
        );
        return;
      }
      const engine = new PitchEngine();
      await engine.start();
      engineRef.current = engine;
      setRunning(true);
    } catch (e) {
      console.error(e);
      setError(describeMicError(e));
    } finally {
      setStarting(false);
    }
  }, []);

  const stopMic = useCallback(async () => {
    await engineRef.current?.stop();
    engineRef.current = null;
    setRunning(false);
    setReadout(null);
  }, []);

  const stopDemo = useCallback(() => {
    melodyHandleRef.current?.stop();
    melodyHandleRef.current = null;
    demoStartRef.current = null;
    setDemoPlaying(false);
  }, []);

  // 基準音の鳴らし／止め
  const toggleRefTone = useCallback(async () => {
    if (refPlaying) {
      stopRefTone();
      setRefPlaying(false);
    } else {
      await startRefTone(refNote);
      setRefPlaying(true);
    }
  }, [refNote, refPlaying]);

  // お手本（選択中パート）の再生／停止
  const toggleDemo = useCallback(async () => {
    if (demoPlaying) {
      stopDemo();
      return;
    }
    setMode("demo");
    demoStartRef.current = performance.now();
    setDemoPlaying(true);
    melodyHandleRef.current = await playMelody(selectedPart.notes, () => {
      demoStartRef.current = null;
      setDemoPlaying(false);
      melodyHandleRef.current = null;
    });
  }, [demoPlaying, selectedPart, stopDemo]);

  const switchMode = useCallback(
    (m: Mode) => {
      if (m === mode) return;
      if (m === "free" && demoPlaying) stopDemo();
      setMode(m);
    },
    [mode, demoPlaying, stopDemo],
  );

  // パートを切り替えたら、再生中のお手本は止める
  const switchPart = useCallback(
    (p: PartId) => {
      if (p === part) return;
      if (demoPlaying) stopDemo();
      setPart(p);
    },
    [part, demoPlaying, stopDemo],
  );

  const targets = mode === "demo" ? selectedPart.notes : null;

  return (
    <div className="app">
      <header className="header">
        <h1>合唱ピッチ可視化</h1>
        <p className="subtitle">
          パート練習サポート ／ サンプル：仰げば尊し（混声四部）
        </p>
      </header>

      {/* 数値表示 */}
      <section className="readout">
        <div className="note-name">{readout ? readout.noteName : "—"}</div>
        <div className="readout-details">
          <div>
            <span className="label">周波数</span>
            <span className="value">
              {readout ? readout.freq.toFixed(1) : "—"} Hz
            </span>
          </div>
          <div>
            <span className="label">ズレ</span>
            <span className="value">{formatCents(readout)}</span>
          </div>
        </div>
        <CentsMeter cents={readout?.cents ?? null} />
      </section>

      {/* パート選択 */}
      <section className="part-select">
        <span className="label">パート</span>
        <div className="part-toggle">
          {PART_ORDER.map((p) => (
            <button
              key={p}
              className={part === p ? "active" : ""}
              onClick={() => switchPart(p)}
            >
              {AOGEBA_PARTS[p].label}
            </button>
          ))}
        </div>
      </section>

      {/* グラフ */}
      <section className="graph-wrap">
        <PitchGraph
          engine={engineRef.current}
          running={running}
          targets={targets}
          demoStartRef={demoStartRef}
          midiMin={range.min}
          midiMax={range.max}
          onReadout={onReadout}
        />
        {!running && (
          <div className="graph-overlay">
            <p>「マイク開始」を押すと、歌った声のピッチがここに流れます</p>
          </div>
        )}
      </section>

      {error && <p className="error">{error}</p>}

      {/* 操作パネル */}
      <section className="controls">
        <div className="control-row">
          {!running ? (
            <button className="primary" onClick={startMic} disabled={starting}>
              {starting ? "起動中…" : "🎤 マイク開始"}
            </button>
          ) : (
            <button className="danger" onClick={stopMic}>
              ■ マイク停止
            </button>
          )}

          <div className="mode-toggle">
            <button
              className={mode === "free" ? "active" : ""}
              onClick={() => switchMode("free")}
            >
              フリー
            </button>
            <button
              className={mode === "demo" ? "active" : ""}
              onClick={() => switchMode("demo")}
            >
              お手本モード
            </button>
          </div>
        </div>

        <div className="control-row">
          <div className="ref-tone">
            <span className="label">基準音</span>
            <select
              value={refNote}
              onChange={(e) => setRefNote(e.target.value)}
              disabled={refPlaying}
            >
              {REF_NOTES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button onClick={toggleRefTone}>
              {refPlaying ? "■ 止める" : "🔔 鳴らす"}
            </button>
          </div>

          <button className="demo-btn" onClick={toggleDemo}>
            {demoPlaying
              ? "■ お手本を停止"
              : `▶ お手本（仰げば尊し・${selectedPart.label}）を再生`}
          </button>
        </div>

        {mode === "demo" && (
          <p className="hint">
            お手本モード：青いバーが「{selectedPart.label}」の音程です。再生を押すと右から流れてきます。
            点線（今の位置）に合わせて歌うと、合っていれば<span className="ok">緑</span>、
            ずれていれば<span className="ng">赤</span>で表示されます（全長 約
            {AOGEBA_DURATION_SEC.toFixed(0)}秒）。パートは上のボタンで切り替えられます。
          </p>
        )}
        {mode === "free" && (
          <p className="hint">
            フリーモード：歌った声がそのまま流れます。最寄りの音にぴったりだと
            <span className="ok">緑</span>、外れると<span className="ng">赤</span>。
            上で選んだパート（{selectedPart.label}）の音域に合わせてグラフの高さが変わります。
            基準音を鳴らして音合わせにも使えます。
          </p>
        )}
      </section>

      <footer className="footer">
        マイク音声はこの端末（ブラウザ）の中だけで処理され、外部には送信されません。
      </footer>
    </div>
  );
}

function formatCents(
  readout: (PitchReadout & { clarity: number }) | null,
): string {
  if (!readout) return "—";
  const c = readout.cents;
  if (c === 0) return "ぴったり";
  const sign = c > 0 ? "♯" : "♭";
  const dir = c > 0 ? "高い" : "低い";
  return `${sign} ${Math.abs(c)} cent（${dir}）`;
}

function describeMicError(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return (
        "マイクの使用が許可されていません。" +
        "アドレスバーのマイク（またはサイト情報）のアイコンから「許可」に変えて、ページを再読み込みしてください。" +
        "Macの場合は「システム設定 → プライバシーとセキュリティ → マイク」で、お使いのブラウザがオンになっているかもご確認ください。"
      );
    case "NotFoundError":
    case "OverconstrainedError":
      return "マイクが見つかりませんでした。マイクが接続・内蔵されているかご確認ください。";
    case "NotReadableError":
      return "マイクを開けませんでした。他のアプリ（ビデオ会議など）がマイクを使っていないかご確認のうえ、ページを再読み込みしてください。";
    default:
      return "マイクを開始できませんでした。ページを再読み込みして、もう一度お試しください。";
  }
}

// セントのズレを表示する小さなメーター
function CentsMeter({ cents }: { cents: number | null }) {
  const clamped = cents === null ? 0 : Math.max(-50, Math.min(50, cents));
  const pct = ((clamped + 50) / 100) * 100;
  const active = cents !== null;
  return (
    <div className={"cents-meter" + (active ? "" : " inactive")}>
      <div className="cents-scale">
        <span>♭ 低い</span>
        <span>0</span>
        <span>高い ♯</span>
      </div>
      <div className="cents-track">
        <div className="cents-center" />
        {active && (
          <div
            className="cents-needle"
            style={{
              left: `${pct}%`,
              background:
                Math.abs(clamped) < 15
                  ? "#3fb950"
                  : Math.abs(clamped) < 35
                    ? "#d29922"
                    : "#f85149",
            }}
          />
        )}
      </div>
    </div>
  );
}
