import { createContext, useContext, useState, type ReactNode } from 'react';
import { ChatFilePreview, type FilePreviewContext } from './ChatFilePreview';
import { parseFileReference } from '../../../../shared/chat/fileReference';

export const ChatFileContext = createContext<FilePreviewContext | null>(null);

function FilePreviewLink({ path, line, children }: { path: string; line?: number; children: ReactNode }) {
  const context = useContext(ChatFileContext)!;
  const [preview, setPreview] = useState(false);
  return <span className="chat-file-link">
    <button type="button" className="chat-text-action" disabled={!context.ready || !context.threadId}
      onClick={() => setPreview(true)}>{children}</button>
    {preview && <ChatFilePreview path={path} line={line} context={context} onClose={() => setPreview(false)} />}
  </span>;
}

export function ChatFileLink({ href, children }: { href?: string; children?: ReactNode }) {
  const context = useContext(ChatFileContext);
  const file = parseFileReference(href ?? '');
  if (file && context) return <FilePreviewLink key={`${context.threadId}:${file.path}`}
    path={file.path} line={file.line}>
    {children}</FilePreviewLink>;
  if (!href || !/^https?:\/\//i.test(href)) return <span>{children}</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}
