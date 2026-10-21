import { PROJECT_FILE_LIMIT, type ProjectBrowserClient } from './protocol';
import type { DocumentsSnapshot } from './documents';
import { withinPath, type BrowserHost, type EntryAction } from './entryActions';

function entryAction(target: Record<string, unknown>): EntryAction {
  if (target.action === 'delete') return { action: 'delete' };
  if (['createFile', 'createFolder', 'rename'].includes(String(target.action))
    && typeof target.name === 'string' && target.name.length <= 255) {
    return { action: target.action as 'createFile' | 'createFolder' | 'rename', name: target.name };
  }
  if ((target.action === 'copy' || target.action === 'move') && typeof target.directory === 'string'
    && target.directory.length <= 4096) return { action: target.action, directory: target.directory };
  throw new Error('操作未完成，请重试。');
}

export interface BrowserSettings {
  type: 'settings'; cwd: string; connected: boolean; labels: Record<string, string>; theme: Record<string, string>;
  autoSaveDelay?: number; snapshot?: DocumentsSnapshot;
}
export interface BrowserReply { type: 'reply'; id: number; data?: unknown; error?: string }
export type BrowserHostMessage = BrowserSettings | BrowserReply | { type: 'close' };

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** The embedded viewer can only access the project selected by its native host. */
export async function handleBrowserRequest(raw: string, options: {
  client: ProjectBrowserClient; cwd: string; connected: boolean; host?: BrowserHost;
}): Promise<BrowserReply | null> {
  let message: Record<string, unknown>;
  try { message = object(JSON.parse(raw)); } catch { return null; }
  if (message.type !== 'request' || !Number.isSafeInteger(message.id)) return null;
  const id = message.id as number;
  try {
    if (!options.connected) throw new Error('连接已断开，重新连接后即可继续。');
    const target = object(message.body);
    if (message.action === 'list' && (target.directory === undefined || typeof target.directory === 'string')) {
      return { type: 'reply', id, data: await options.client.list(options.cwd, target.directory as string | undefined) };
    }
    if (typeof target.path !== 'string' || target.path.length > 4096) throw new Error('文件暂时无法读取，请重试。');
    const file = { cwd: options.cwd, path: target.path };
    if (message.action === 'mutate') {
      return { type: 'reply', id, data: await options.client.mutate({ ...file, ...entryAction(target) }) };
    }
    if (message.action === 'copyPath' || message.action === 'download') {
      if (!options.host || !withinPath(file.path, options.cwd)
        || file.path.replace(/\\/g, '/').split('/').includes('..')) throw new Error('操作未完成，请重试。');
      const data = message.action === 'copyPath' ? await options.host.copyPath(file.path)
        : await options.host.download?.(file);
      return { type: 'reply', id, data };
    }
    if (message.action === 'read') return { type: 'reply', id, data: await options.client.read(file) };
    if (message.action !== 'save' || typeof target.text !== 'string' || target.text.length > PROJECT_FILE_LIMIT
      || typeof target.revision !== 'string') throw new Error('未能保存文件，请确认文件可写后重试。');
    return { type: 'reply', id,
      data: await options.client.save({ ...file, text: target.text, revision: target.revision }) };
  } catch (error) {
    return { type: 'reply', id,
      error: typeof error === 'string' ? error : error instanceof Error ? error.message : '文件暂时无法读取，请重试。' };
  }
}
