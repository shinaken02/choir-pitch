// お手本再生に合わせて歌詞をカラオケのように進める表示。
// 再生位置（経過秒）から「今うたっている文字」を求めてハイライトします。

import { useEffect, useState } from "react";
import type { LyricChunk } from "../music/aogebaSATB";

interface Props {
  lines: LyricChunk[][];
  /** お手本の再生開始時刻（performance.now基準, ms）。再生中でなければ null */
  demoStartRef: React.MutableRefObject<number | null>;
  /** お手本を再生中かどうか */
  playing: boolean;
}

export function LyricsKaraoke({ lines, demoStartRef, playing }: Props) {
  // 今ハイライトする文字の通し番号（-1 はどれもハイライトしない）
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!playing) {
      setActiveIndex(-1);
      return;
    }
    const flat = lines.flat();
    let raf = 0;
    const tick = () => {
      const start = demoStartRef.current;
      if (start !== null) {
        const elapsed = (performance.now() - start) / 1000;
        // 開始時刻が経過時間を超えない最後の文字を「今の文字」とする
        let idx = -1;
        for (let i = 0; i < flat.length; i++) {
          if (flat[i].startSec <= elapsed) idx = i;
          else break;
        }
        setActiveIndex((prev) => (prev === idx ? prev : idx));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, lines, demoStartRef]);

  // 各行の文字に通し番号を振りながら描画する
  let globalIndex = -1;
  return (
    <div className="lyrics">
      {lines.map((line, li) => (
        <div className="lyric-line" key={li}>
          {line.map((chunk, ci) => {
            globalIndex += 1;
            const g = globalIndex;
            const cls =
              g === activeIndex ? "active" : g < activeIndex ? "past" : "";
            return (
              <span className={`syllable ${cls}`} key={ci}>
                {chunk.text}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
