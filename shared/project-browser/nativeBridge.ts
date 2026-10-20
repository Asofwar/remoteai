import { PROJECT_FILE_LIMIT, type ProjectBrowserClient } from './protocol';

export interface BrowserSettings {
  type: 'settings'; cwd: string; connected: boolean; labels: Record<string, string>; theme: Record<string, string>;
}
export interface BrowserReply { type: 'reply'; id: number; data?: unknown; error?: string }
export type BrowserHostMessage = BrowserSettings | BrowserReply | { type: 'close' };

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** The embedded viewer can only access the project selected by its native host. */
export async function handleBrowserRequest(raw: string, options: {
  client: ProjectBrowserClient; cwd: string; connected: boolean;
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
