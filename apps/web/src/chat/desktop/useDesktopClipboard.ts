import { useEffect, useRef, useState } from 'react';
import type { ClipboardContent, LocalDesktopClipboard } from '../../../../../shared/remote-desktop/clipboard';
import type { DesktopClipboard } from '../../../../../shared/remote-desktop/clipboardTransfer';
import { ClipboardOrigin } from '../../../../../shared/remote-desktop/clipboardOrigin';
import { readPastedContent } from '../../../../../shared/chat/clipboard';
import { browserDesktopClipboard, downloadClipboardFile, filesContent, readBrowserClipboardBaseline }
  from './clipboardContent';
import { useClipboardQueue } from './useClipboardQueue';

interface Options {
  active: boolean; clipboard: Pick<DesktopClipboard, 'read' | 'write' | 'copy' | 'paste'>;
  localClipboard?: LocalDesktopClipboard;
}
export function useDesktopClipboard({ active, clipboard, localClipboard }: Options) {
  const local = localClipboard ?? browserDesktopClipboard;
  const [open, setOpen] = useState(false);
  const [received, setReceived] = useState<ClipboardContent>();
  const [needsSave, setNeedsSave] = useState(false);
  const { busy, status, progress, setStatus, run, report } = useClipboardQueue(active, open);
  const origin = useRef(new ClipboardOrigin());
  const pendingCopies = useRef(0);
  useEffect(() => {
    if (!active) { setOpen(false); setReceived(undefined); setNeedsSave(false); }
    return () => { origin.current.reset(); pendingCopies.current = 0; };
  }, [active]);

  const send = (content: () => Promise<ClipboardContent>, fromFiles = false) => {
    void run(async current => {
      const value = await content();
      const baseline = fromFiles ? await local.read().catch(() => undefined) : value;
      if (!current()) return;
      await clipboard.write(value, true, report(current));
      if (current()) { origin.current.remember(baseline); setStatus(''); }
    });
  };
  const copy = (shortcut?: 'copy' | 'cut') => {
    if (!active) return;
    pendingCopies.current += 1;
    void run(async current => {
      setReceived(undefined); setNeedsSave(false); origin.current.remember();
      // Read the local baseline alongside the remote gesture; local access cannot block native copy/cut.
      const baseline = localClipboard ? local.read().catch(() => undefined) : readBrowserClipboardBaseline();
      try {
        const content = await (shortcut ? clipboard.copy(shortcut, report(current))
          : clipboard.read(undefined, report(current)));
        const before = await baseline;
        if (!current()) return;
        origin.current.remember(before);
        if (!content) { setStatus(''); return; }
        setReceived(content);
        if (content.format === 'files' && !local.files) {
          if (content.files.length === 1) downloadClipboardFile(content.files[0]);
          setStatus(content.files.length === 1 ? '' : '文件已收到，点击“下载文件”保存。'); return;
        }
        try {
          await local.write(content);
          if (current()) { origin.current.remember(content); setStatus(''); }
        } catch {
          if (current()) { setStatus('内容已收到，请点击“复制到本机”。'); setNeedsSave(true); }
        }
      } catch (error) {
        const before = await baseline;
        if (current()) origin.current.remember(before);
        throw error;
      } finally { if (current()) pendingCopies.current -= 1; }
    });
  };
  const pasteAutomatic = (read: () => Promise<ClipboardContent | undefined>) => {
    // Browser paste data may predate a copy still in flight. Such a gesture belongs to the remote clipboard.
    const copying = pendingCopies.current > 0;
    void run(async current => {
      const content = await read().catch(() => undefined);
      if (!current()) return;
      const revision = await clipboard.paste(!copying && origin.current.preferLocal(content));
      if (!current()) return;
      if (revision && content) await clipboard.write(content, true, report(current), revision);
      if (current()) { if (!copying) origin.current.remember(content); setStatus(''); }
    });
  };
  const paste = (data: DataTransfer) => {
    if (localClipboard) { pasteAutomatic(local.read); return; }
    if (pendingCopies.current) { pasteAutomatic(async () => undefined); return; }
    const { files, text, missingImages } = readPastedContent(data);
    if (missingImages || (!files.length && !text)) { pasteAutomatic(async () => undefined); return; }
    const image = !data.getData('text/plain');
    pasteAutomatic(() => files.length ? filesContent(files, image) : Promise.resolve({ format: 'text', text }));
  };
  const save = () => {
    if (!active || busy || !received) return;
    // Start the write during the click so browsers can use its clipboard permission.
    const saving = local.write(received).then(() => true, () => false);
    void run(async current => {
      if (!await saving) throw new Error('无法访问剪贴板，请重新复制后再试。');
      if (current()) { origin.current.remember(received); setStatus(''); setNeedsSave(false); }
    });
  };
  return { open, setOpen, busy, status, progress, received, copy, paste, save, needsSave, nativeFiles: local.files,
    pasteShortcut: localClipboard ? () => pasteAutomatic(local.read) : undefined,
    pasteLocal: () => send(local.read), sendFiles: (files: File[]) => send(() => filesContent(files), true) };
}
