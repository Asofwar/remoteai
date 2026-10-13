import { invoke } from '@tauri-apps/api/core';
import type { LocalDesktopClipboard } from '../../../../shared/remote-desktop/clipboard';

const CLIPBOARD_ACCESS_ERROR = '无法访问剪贴板，请重新复制后再试。';
const RETRY_DELAY_MS = 60;
const MAX_ATTEMPTS = 3;

async function withClipboardRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      // Another application can briefly own the OS clipboard. Never repeat a remote copy or cut.
      const message = error instanceof Error ? error.message : error;
      if (message !== CLIPBOARD_ACCESS_ERROR || attempt >= MAX_ATTEMPTS) throw error;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

/** Native file clipboard entries remain available for pasting into Explorer after closing the viewer. */
export const localDesktopClipboard: LocalDesktopClipboard = {
  files: true,
  read: () => withClipboardRetry(() => invoke('remote_desktop_read_local_clipboard')),
  write: content => withClipboardRetry(() => invoke('remote_desktop_write_local_clipboard', { content })),
};
