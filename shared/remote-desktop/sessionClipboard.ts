import type { ClipboardContent, ClipboardProgress } from './clipboard';
import type { DesktopCapabilities } from './protocol';
import type { DesktopReceiver } from './receiver';
import { sendDesktopChord } from './softKeyboard';

/** Older hosts retain native editing; only negotiated hosts may automatically replace their clipboard. */
export function sessionClipboard(receiver: () => DesktopReceiver | undefined, capabilities: DesktopCapabilities) {
  const current = () => {
    const session = receiver();
    if (!session) throw new Error('请等待桌面连接后重试。');
    return session;
  };
  const sharing = () => {
    if (!capabilities.clipboard) throw new Error(capabilities.control === undefined
      ? '请更新远程电脑上的应用，启用实体键盘和剪贴板。' : '电脑未允许剪贴板操作，请在电脑的设置中调整。');
    return current().clipboard;
  };
  const shortcut = (code: string) => sendDesktopChord(event => current().input(event),
    [capabilities.platform === 'macos' ? 'MetaLeft' : 'ControlLeft', code]);
  return {
    read: (key?: 'copy' | 'cut', progress?: ClipboardProgress) => sharing().read(key, progress),
    write: (content: ClipboardContent, paste = true, progress?: ClipboardProgress, revision?: string) =>
      sharing().write(content, paste, progress, revision),
    copy: async (key: 'copy' | 'cut', progress?: ClipboardProgress) => {
      if (capabilities.clipboardNative) return current().clipboard.copy(key, progress);
      shortcut(key === 'copy' ? 'KeyC' : 'KeyX');
      return undefined;
    },
    paste: async (preferLocal: boolean) => {
      if (capabilities.clipboardNative) return current().clipboard.paste(preferLocal);
      shortcut('KeyV');
      return undefined;
    },
  };
}
