export const AUTO_SAVE_KEY = 'codex-switch.project-browser.auto-save';
export const DEFAULT_AUTO_SAVE_DELAY = 1000;
export const AUTO_SAVE_OPTIONS = [
  { value: 0, label: '关闭自动保存' },
  { value: 1000, label: '1 秒' },
  { value: 2000, label: '2 秒' },
  { value: 5000, label: '5 秒' },
  { value: 10000, label: '10 秒' },
] as const;

export function autoSaveDelay(value: unknown): number {
  return typeof value === 'number' && AUTO_SAVE_OPTIONS.some(option => option.value === value)
    ? value : DEFAULT_AUTO_SAVE_DELAY;
}

export interface BrowserPreferences {
  delay: number;
  change: (delay: number) => void;
}
