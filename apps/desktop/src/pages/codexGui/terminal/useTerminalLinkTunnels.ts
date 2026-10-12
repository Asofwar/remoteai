import { useEffect, useMemo } from 'react';
import type { GuiToolsClient } from '../../../../../../shared/remote-chat/guiTools';
import { TerminalLinkTunnels } from './linkTunnel';

export function useTerminalLinkTunnels(client: GuiToolsClient['terminal']) {
  const scope = useMemo(() => {
    let tunnels: TerminalLinkTunnels | undefined;
    return {
      resolve: (id: string, url: string) => (tunnels ??= new TerminalLinkTunnels(client)).resolve(id, url),
      close: () => { tunnels?.close(); tunnels = undefined; },
    };
  }, [client]);
  useEffect(() => scope.close, [scope]);
  return scope.resolve;
}
