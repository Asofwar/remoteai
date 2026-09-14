import { useCallback, useEffect, useRef, useState } from "react";

export const OUTPUT_BATCH_CHARACTERS = 8_000;
const LOAD_AHEAD_PIXELS = 120;

/** Append output near the scroll boundary without replacing already-visible content with another page. */
export function useProgressiveToolText(text: string) {
  const viewport = useRef<HTMLDivElement>(null);
  const frame = useRef<number>();
  const [source, setSource] = useState(text);
  const [limit, setLimit] = useState(OUTPUT_BATCH_CHARACTERS);
  if (source !== text) {
    setSource(text);
    if (!text.startsWith(source)) setLimit(OUTPUT_BATCH_CHARACTERS);
  }
  const loadNearEnd = useCallback(() => {
    if (frame.current !== undefined) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      const element = viewport.current;
      if (!element || element.clientHeight <= 0) return;
      if (element.scrollHeight - element.scrollTop - element.clientHeight > LOAD_AHEAD_PIXELS) return;
      setLimit((current) => Math.max(current, Math.min(current + OUTPUT_BATCH_CHARACTERS, text.length)));
    });
  }, [text.length]);
  useEffect(() => {
    // Also fill a short viewport and pick up appended streaming output when already at its bottom.
    loadNearEnd();
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
    };
  }, [limit, loadNearEnd]);
  return { viewport, loadNearEnd, visible: text.slice(0, limit) };
}
