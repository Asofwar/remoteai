import { invoke } from './backend';

export const SHORTCUT_ACTIONS = [
  'screenshot', 'showMainWindow', 'openSettings', 'openTokenUsage', 'toggleFloatingBubble',
] as const;
export type ShortcutAction = typeof SHORTCUT_ACTIONS[number];
export type ShortcutError = 'invalid' | 'duplicate' | 'unavailable' | 'load' | 'save' | 'unsupported';
export interface ShortcutSetting {
  action: ShortcutAction;
  shortcut: string | null;
  active: boolean;
  supported: boolean;
  error: ShortcutError | null;
}

export const DEFAULT_SCREENSHOT_SHORTCUT = 'Alt+Shift+KeyS';
export const getKeyboardShortcuts = () => invoke<ShortcutSetting[]>('get_keyboard_shortcuts');
export const setKeyboardShortcut = (action: ShortcutAction, shortcut: string | null) =>
  invoke<ShortcutSetting[]>('set_keyboard_shortcut', { update: { action, shortcut } });

export function shortcutLabel(shortcut: string | null): string {
  return (shortcut ?? '').replace(/Key([A-Z])/g, '$1').replace(/Digit([0-9])/g, '$1')
    .replace(/Super/g, /Mac/.test(navigator.platform) ? '⌘' : 'Win').split('+').join(' + ');
}

export function shortcutError(error: unknown, fallback: ShortcutError): ShortcutError {
  const codes = ['invalid', 'duplicate', 'unavailable', 'load', 'save', 'unsupported'];
  return typeof error === 'string' && codes.includes(error)
    ? error as ShortcutError : fallback;
}
