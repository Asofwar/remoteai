import { mockIPC } from '@tauri-apps/api/mocks';

const actions = ['screenshot', 'showMainWindow', 'openSettings', 'openTokenUsage', 'toggleFloatingBubble'];
const saved = localStorage.getItem('shortcut-test-bindings');
let settings: { action: string; shortcut: string | null; active: boolean; supported: boolean; error: null }[] = saved
  ? JSON.parse(saved) : actions.map(action => ({ action, shortcut: action === 'screenshot' ? 'Alt+Shift+KeyS' : null,
    active: action === 'screenshot', supported: true, error: null }));
mockIPC((command, args) => {
  if (command === 'get_keyboard_shortcuts') return settings;
  if (command !== 'set_keyboard_shortcut') throw new Error(`Unexpected command: ${command}`);
  const { action, shortcut } = (args as { update: { action: string; shortcut: string | null } }).update;
  if (settings.some(value => value.action !== action && value.shortcut && value.shortcut === shortcut)) {
    throw 'duplicate';
  }
  if (shortcut === 'Ctrl+Alt+Digit9') throw 'unavailable';
  settings = settings.map(value => value.action === action ? { ...value, shortcut, active: !!shortcut } : value);
  localStorage.setItem('shortcut-test-bindings', JSON.stringify(settings));
  return settings;
});
await import('./keyboard-shortcuts-view');
