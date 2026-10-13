import type { FileReference } from '../chat/fileReference';
import type { TerminalLinkReply, TerminalLinkRequest } from '../terminal/links';

export type FileTarget = FileReference & { threadId: string | null };
export interface FileApplication { id: string; name: string; kind: 'editor' | 'terminal' | 'system'; icon?: string }
export type FileAction = { type: 'open'; application: string }
  | { type: 'copyFile' | 'copyPath' | 'copyContents' | 'saveAs' | 'reveal' };
export interface FileActionResult { path: string; text?: string; saved: boolean }
export type PreviewKind = 'html' | 'markdown' | 'text' | 'image' | 'pdf' | 'video' | 'audio';
export interface FilePreviewData extends FileReference {
  sessionId: string; name: string; kind: PreviewKind; text: string | null; url: string;
}
export const GUI_FILE_OPERATIONS = new Set([
  'guiFileApplications', 'guiFileAction', 'guiFilePreviewOpen', 'guiFilePreviewClose', 'guiFilePreviewHost',
  'guiResourceOpen', 'guiResourceClose', 'guiResourceLink',
]);

/** Every request travels over the selected computer's authenticated connection. */
export function createGuiFilesClient(request: <T>(body: object) => Promise<T>) {
  return {
    applications: () => request<FileApplication[]>({ operation: 'guiFileApplications' }),
    perform: (target: FileTarget, action: FileAction) =>
      request<FileActionResult>({ operation: 'guiFileAction', target, action }),
    open: (target: FileTarget) => request<FilePreviewData | null>({ operation: 'guiFilePreviewOpen', target }),
    close: (id: string) => request<void>({ operation: 'guiFilePreviewClose', id }),
    forwardHost: (id: string, host: string) => request<void>({ operation: 'guiFilePreviewHost', id, host }),
    openResource: (url: string) => request<string>({ operation: 'guiResourceOpen', url }),
    closeResource: (id: string) => request<void>({ operation: 'guiResourceClose', id }),
    link: (id: string, input: TerminalLinkRequest) =>
      request<TerminalLinkReply>({ operation: 'guiResourceLink', id, request: input }),
  };
}
