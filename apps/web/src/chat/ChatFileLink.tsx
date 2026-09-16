import { createContext, useContext, useState, type ReactNode } from 'react';
import { ChatFilePreview, type FilePreviewContext } from './ChatFilePreview';
import { parseFileReference } from '../../../../shared/chat/fileReference';
import { useFileDownload } from '../../../../shared/remote-chat/useFileDownload';
import { browserDownloadTarget, prepareBrowserDownload } from './fileDownloadTarget';

export const ChatFileContext = createContext<FilePreviewContext | null>(null);

function DownloadLink({ path, line, children }: { path: string; line?: number; children: ReactNode }) {
  const context = useContext(ChatFileContext)!;
  const [preview, setPreview] = useState(false);
  const download = useFileDownload({ ...context, path, target: browserDownloadTarget,
    prepare: () => prepareBrowserDownload(path), success: '文件已交给浏览器保存' });
  return <span className="chat-file-link">
    <button type="button" className="chat-text-action" disabled={!context.ready || !context.threadId}
      onClick={() => setPreview(true)}>{children}</button>{' '}
    <button type="button" className="chat-button" disabled={!download.busy && !context.ready}
      onClick={download.busy ? download.cancel : download.start}>{download.label}</button>
    {download.busy && !!download.detail && <span style={{ display: 'block', maxWidth: 400 }}>{download.detail}</span>}
    {!!download.message && <span role="status" style={{ display: 'block', maxWidth: 400 }}>{download.message}</span>}
    {preview && <ChatFilePreview path={path} line={line} context={context} onClose={() => setPreview(false)} />}
  </span>;
}

export function ChatFileLink({ href, children }: { href?: string; children?: ReactNode }) {
  const context = useContext(ChatFileContext);
  const file = parseFileReference(href ?? '');
  if (file && context) return <DownloadLink key={`${context.threadId}:${file.path}`} path={file.path} line={file.line}>
    {children}</DownloadLink>;
  if (!href || !/^https?:\/\//i.test(href)) return <span>{children}</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}
