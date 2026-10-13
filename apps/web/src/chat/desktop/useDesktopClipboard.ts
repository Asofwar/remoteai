import { useEffect, useRef, useState } from 'react';
import type { ClipboardContent, LocalDesktopClipboard } from '../../../../../shared/remote-desktop/clipboard';
import type { DesktopClipboard } from '../../../../../shared/remote-desktop/clipboardTransfer';
import { readPastedContent } from '../../../../../shared/chat/clipboard';
import { browserDesktopClipboard, downloadClipboardFile, filesContent } from './clipboardContent';

const PROGRESS_DELAY_MS = 800;
const NOTICE_DURATION_MS = 6000;

interface Options {
  active: boolean; clipboard: Pick<DesktopClipboard, 'read' | 'write'>; localClipboard?: LocalDesktopClipboard;
}
export function useDesktopClipboard({ active, clipboard, localClipboard }: Options) {
  const local = localClipboard ?? browserDesktopClipboard;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState<number>();
  const [received, setReceived] = useState<ClipboardContent>();
  const [needsSave, setNeedsSave] = useState(false);
  const queue = useRef({ tail: Promise.resolve(), pending: 0 });
  const pendingCopy = useRef<Promise<ClipboardContent | undefined>>();
  const generation = useRef(0);
  useEffect(() => {
    if (!active) {
      setOpen(false); setBusy(false); setProgress(undefined);
      setReceived(undefined); setStatus(''); setNeedsSave(false);
    }
    return () => {
      generation.current += 1; queue.current = { tail: Promise.resolve(), pending: 0 }; pendingCopy.current = undefined;
    };
  }, [active]);
  useEffect(() => {
    if (busy || open || !status) return;
    const timeout = setTimeout(() => setStatus(''), NOTICE_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [busy, open, status]);
  const run = <Result,>(operation: (current: () => boolean) => Promise<Result>): Promise<Result | undefined> => {
    if (!active) return Promise.resolve(undefined);
    const started = generation.current;
    const current = () => generation.current === started;
    const pending = queue.current;
    pending.pending += 1; setBusy(true);
    const task = pending.tail.then(async () => {
      if (!current()) return;
      setStatus(''); setProgress(0);
      const notice = setTimeout(() => {
        if (current()) setStatus('正在传输剪贴板…');
      }, PROGRESS_DELAY_MS);
      try { return await operation(current); }
      catch (error) {
        if (current()) {
          setStatus(error instanceof Error ? error.message
            : typeof error === 'string' ? error : '剪贴板传输失败，请重试。');
        }
      } finally {
        clearTimeout(notice);
        pending.pending -= 1;
        if (current()) { setBusy(pending.pending > 0); setProgress(undefined); }
      }
    });
    pending.tail = task.then(() => undefined);
    return task;
  };
  const report = (current: () => boolean) => (completed: number, total: number) => {
    if (current()) setProgress(Math.round(completed / total * 100));
  };
  const send = (content: () => Promise<ClipboardContent>) => {
    void run(async current => {
      const value = await content();
      if (!current()) return;
      await clipboard.write(value, true, report(current));
      if (current()) setStatus('');
    });
  };
  const copy = (shortcut?: 'copy' | 'cut') => {
    const task = run(async current => {
      setReceived(undefined); setNeedsSave(false);
      const content = await clipboard.read(shortcut, report(current));
      if (!current()) return;
      setReceived(content);
      if (content.format === 'files' && !local.files) {
        if (content.files.length === 1) downloadClipboardFile(content.files[0]);
        setStatus(content.files.length === 1 ? '' : '文件已收到，点击“下载文件”保存。'); return content;
      }
      try { await local.write(content); if (current()) setStatus(''); }
      catch { if (current()) { setStatus('内容已收到，请点击“复制到本机”。'); setNeedsSave(true); } }
      return content;
    });
    pendingCopy.current = task;
    void task.then(() => { if (pendingCopy.current === task) pendingCopy.current = undefined; });
  };
  const pasteCopy = () => {
    const copying = pendingCopy.current;
    if (!copying) return false;
    send(async () => {
      const content = await copying;
      if (!content) throw new Error('未能复制所选内容，请确认远程窗口后重试。');
      return content;
    });
    return true;
  };
  const pasteLocal = () => { if (!pasteCopy()) send(local.read); };
  const paste = (data: DataTransfer) => {
    if (localClipboard) { pasteLocal(); return; }
    // A trusted paste event may still contain the old local clipboard while the remote copy is in flight.
    if (pasteCopy()) return;
    const { files, text, missingImages } = readPastedContent(data);
    if (missingImages) { setStatus('图片未能读取，请保存后选择文件发送。'); return; }
    if (!files.length && !text) {
      setStatus('剪贴板中没有可发送的内容，请重新复制或选择文件。'); return;
    }
    const image = !data.getData('text/plain');
    send(() => files.length ? filesContent(files, image) : Promise.resolve({ format: 'text', text }));
  };
  const save = () => {
    if (!active || busy || !received) return;
    // Start the write during the click so browsers can use its clipboard permission.
    const saving = local.write(received).then(() => true, () => false);
    void run(async current => {
      if (!await saving) throw new Error('无法访问剪贴板，请重新复制后再试。');
      if (current()) { setStatus(''); setNeedsSave(false); }
    });
  };
  return { open, setOpen, busy, status, progress, received, copy, paste, save, needsSave, nativeFiles: local.files,
    pasteShortcut: localClipboard ? pasteLocal : undefined,
    pasteLocal, sendFiles: (files: File[]) => send(() => filesContent(files)) };
}
