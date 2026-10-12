import type { GuiToolsClient } from './guiTools';
import type { TerminalApi } from '../terminal/types';
import { readTerminal } from './terminalReader';
import { remoteDevelopmentUrl } from '../terminal/links';
import type { ResolveTerminalLink } from '../terminal/links';

export function remoteTerminalApi(client: Omit<GuiToolsClient['terminal'], 'link'>,
  resolveLink?: ResolveTerminalLink): TerminalApi {
  const readers = new Map<string, () => void>();
  const attach: NonNullable<TerminalApi['attach']> = async (info, size, onEvent) => {
    readers.get(info.id)?.();
    const stop = readTerminal({ client, id: info.id, onEvent });
    readers.set(info.id, stop);
    // Resizing can fail during a reconnect; output polling keeps the attachment alive.
    void client.resize(info.id, size).catch(() => undefined);
    return { ...info, detach: () => {
      stop();
      if (readers.get(info.id) === stop) readers.delete(info.id);
    } };
  };
  const detach = (id: string) => { readers.get(id)?.(); readers.delete(id); };
  return {
    resolveLink: async (id, url) => {
      if (!remoteDevelopmentUrl(url)) return url;
      if (resolveLink) return resolveLink(id, url);
      throw new Error('请在桌面端打开远程电脑的网页。');
    },
    async open(cwd, size, onEvent) {
      const info = await client.open(cwd, size);
      return attach(info, size, onEvent);
    },
    attach,
    detach,
    write: client.write,
    resize: client.resize,
    close: async (id) => { await client.close(id); detach(id); },
  };
}
