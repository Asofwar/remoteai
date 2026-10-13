import { invoke } from '../api/backend';
import { object } from '../../../../shared/remote-chat/protocol';
import type { FilePreviewData } from '../../../../shared/remote-chat/files';

interface Resource { kind: 'preview' | 'resource'; id?: string }
const MAX_RESOURCES = 16;
const unavailable = () => new Error('连接已断开，请重新打开预览。');

/** Handles belong to the authenticated transport owner, never to an owner supplied in a request body. */
export class RemoteFiles {
  private readonly owners = new Map<string, Set<Resource>>();

  async request(body: Record<string, unknown>, owner: string): Promise<unknown> {
    if (body.operation === 'guiFileApplications') return invoke('codex_gui_file_applications');
    if (body.operation === 'guiFileAction') {
      // Saving on the viewer uses its download manager, not an unattended dialog on the host.
      if (!['open', 'copyFile', 'copyPath', 'copyContents', 'reveal'].includes(String(object(body.action).type))) {
        throw new Error('请选择有效的文件操作。');
      }
      return invoke('codex_gui_file_action', { request: { target: body.target, action: body.action } });
    }
    if (body.operation === 'guiFilePreviewOpen' || body.operation === 'guiResourceOpen') return this.open(body, owner);
    const resource = [...(this.owners.get(owner) ?? [])].find(value => value.id === body.id);
    const closing = body.operation === 'guiFilePreviewClose' || body.operation === 'guiResourceClose';
    if (!resource) { if (closing) return; throw unavailable(); }
    const preview = String(body.operation).startsWith('guiFilePreview');
    if (preview !== (resource.kind === 'preview')) throw unavailable();
    if (closing) {
      this.owners.get(owner)?.delete(resource);
      return close(resource);
    }
    if (body.operation === 'guiFilePreviewHost') {
      return invoke('codex_gui_file_preview_host', { sessionId: resource.id, host: body.host });
    }
    if (body.operation !== 'guiResourceLink') throw unavailable();
    const request = object(body.request);
    if (!['connect', 'read', 'write', 'close'].includes(String(request.type))) throw unavailable();
    return invoke('codex_gui_resource_link', { request: { ...request, scope: resource.id } });
  }

  private async open(body: Record<string, unknown>, owner: string) {
    const resources = this.owners.get(owner) ?? new Set<Resource>();
    if (resources.size >= MAX_RESOURCES) throw new Error('预览较多，请先关闭一个再试。');
    this.owners.set(owner, resources);
    const resource: Resource = { kind: body.operation === 'guiFilePreviewOpen' ? 'preview' : 'resource' };
    resources.add(resource);
    try {
      const result = resource.kind === 'preview'
        ? await invoke<FilePreviewData | null>('codex_gui_open_file_preview', { target: body.target })
        : await invoke<string>('codex_gui_resource_open', { url: body.url });
      resource.id = typeof result === 'string' ? result : result?.sessionId;
      if (!resources.has(resource)) { await close(resource); throw unavailable(); }
      if (!result) resources.delete(resource);
      return result;
    } catch (error) { resources.delete(resource); throw error; }
  }

  release(owner?: string) {
    for (const [key, resources] of this.owners) {
      if (owner !== undefined && key !== owner) continue;
      this.owners.delete(key);
      for (const resource of resources) void close(resource).catch(() => console.warn('Preview cleanup failed'));
      resources.clear();
    }
  }
}

async function close(resource: Resource) {
  if (!resource.id) return;
  if (resource.kind === 'preview') await invoke('codex_gui_close_file_preview', { sessionId: resource.id });
  else await invoke('codex_gui_resource_link', { request: { type: 'stop', scope: resource.id } });
}
