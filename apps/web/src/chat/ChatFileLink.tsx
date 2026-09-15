import { createContext, useContext, type ReactNode } from 'react';
import type { FileClient } from '../../../../shared/remote-chat/fileDownload';
import { parseFileReference } from '../../../../shared/chat/fileReference';
import { useFileDownload } from '../../../../shared/remote-chat/useFileDownload';
import { browserDownloadTarget, prepareBrowserDownload } from './fileDownloadTarget';

export const ChatFileContext = createContext<{ client: FileClient; threadId: string | null; ready: boolean } | null>(null);

function DownloadLink({ path, children }: { path: string; children: ReactNode }) {
  const context = useContext(ChatFileContext)!;
  const download = useFileDownload({ ...context, path, target: browserDownloadTarget,
    prepare: () => prepareBrowserDownload(path), success: '文件已交给浏览器保存' });
  return <span className="chat-file-link">
    <span>{children}</span>{' '}
    <button type="button" className="chat-button" disabled={!download.busy && !context.ready}
      onClick={download.busy ? download.cancel : download.start}>{download.label}</button>
    {!!download.message && <span role="status" style={{ display: 'block', maxWidth: 400 }}>{download.message}</span>}
  </span>;
}

export function ChatFileLink({ href, children }: { href?: string; children?: ReactNode }) {
  const context = useContext(ChatFileContext);
  const file = parseFileReference(href ?? '');
  if (file && context) return <DownloadLink key={`${context.threadId}:${file.path}`} path={file.path}>
    {children}</DownloadLink>;
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}
