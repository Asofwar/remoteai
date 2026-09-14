import { useEffect, useRef, useState } from "react";
import { invoke } from "../../api/backend";

const TOKENS_PER_K = 1_000;
export const MIN_CONTEXT_K = 1;
export const MAX_CONTEXT_K = 100_000;
interface ContextSettings { capacity: number | null }

export function parseContextCapacity(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(?:\.\d{1,3})?$/.test(trimmed)) return undefined;
  const capacity = Math.round(Number(trimmed) * TOKENS_PER_K);
  return Number.isSafeInteger(capacity) && capacity >= MIN_CONTEXT_K * TOKENS_PER_K
    && capacity <= MAX_CONTEXT_K * TOKENS_PER_K ? capacity : undefined;
}

export function useContextSettings(threadId: string) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoaded(false); setError("");
    void invoke<ContextSettings>("codex_gui_context_settings", { threadId }).then((settings) => {
      if (cancelled) return;
      setValue(settings.capacity === null ? "" : String(settings.capacity / TOKENS_PER_K));
      setLoaded(true);
    }).catch(() => {
      if (!cancelled) setError("暂时无法读取上下文设置，请重试。");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [threadId, attempt]);

  const save = async () => {
    if (!loaded || loading || pending.current) return false;
    const capacity = parseContextCapacity(value);
    if (capacity === undefined) { setError("请输入 1 至 100000 K 之间的上下文容量。"); return false; }
    pending.current = true; setSaving(true); setError("");
    try {
      await invoke<ContextSettings>("codex_gui_set_context_settings", { threadId, settings: { capacity } });
      return mounted.current;
    } catch {
      if (mounted.current) setError("未能保存上下文设置，请重试。");
      return false;
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  return { value, setValue, loading, loaded, saving, error, save, retry: () => setAttempt((value) => value + 1) };
}
