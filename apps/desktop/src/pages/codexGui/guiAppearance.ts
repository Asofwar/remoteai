import { useSyncExternalStore, type CSSProperties } from "react";

const STORAGE_KEY = "codex-switch:gui-font-size";
const CHANGE_EVENT = "codex-switch:gui-appearance-changed";
export const DEFAULT_GUI_FONT_SIZE = 14;
export const MIN_GUI_FONT_SIZE = 12;
export const MAX_GUI_FONT_SIZE = 24;

export function normalizeGuiFontSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_GUI_FONT_SIZE;
  return Math.min(MAX_GUI_FONT_SIZE, Math.max(MIN_GUI_FONT_SIZE, Math.round(value)));
}

function readFontSize(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === null ? DEFAULT_GUI_FONT_SIZE : normalizeGuiFontSize(JSON.parse(saved));
  } catch { return DEFAULT_GUI_FONT_SIZE; }
}

export function saveGuiFontSize(value: number): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, String(normalizeGuiFontSize(value)));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch { return false; }
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useGuiFontSize() {
  return useSyncExternalStore(subscribe, readFontSize, () => DEFAULT_GUI_FONT_SIZE);
}

export function guiFontStyle(fontSize: number): CSSProperties {
  return { "--gui-font-size": `${fontSize}px` } as CSSProperties;
}
