import { t } from '../../i18n';
import type { useDesktopClipboard } from './useDesktopClipboard';

/** Clipboard feedback must leave the remote keyboard focused and never open a panel on its own. */
export function DesktopClipboardNotice({ clipboard }: { clipboard: ReturnType<typeof useDesktopClipboard> }) {
  if (clipboard.open || !clipboard.status) return null;
  const files = clipboard.received?.format === 'files' && !clipboard.nativeFiles;
  return <div className="rd-clipboard-notice" role="status">
    {t(clipboard.status)}{clipboard.progress !== undefined && ` ${clipboard.progress}%`}
    {clipboard.needsSave && !clipboard.busy && <button onMouseDown={event => event.preventDefault()}
      onClick={clipboard.save}>{t('复制到本机')}</button>}
    {files && !clipboard.busy && <button onClick={() => clipboard.setOpen(true)}>{t('下载文件')}</button>}
  </div>;
}
