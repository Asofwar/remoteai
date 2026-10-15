import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { PortForwardingService, type ForwardingClient } from '../../../../../shared/port-mapping/service';
import { readPortMappings, savePortMappings } from '../../../../../shared/port-mapping/settings';
import { WebMappingTunnel } from './httpTunnel';

export function usePortMappings(options: { client: ForwardingClient; scope: string; connected: boolean }) {
  const { client, scope, connected } = options;
  const manager = useMemo(() => {
    const tunnels = new Map<string, WebMappingTunnel>();
    const service = new PortForwardingService(client, readPortMappings(scope, undefined, undefined, 'preview'), {
      mode: 'preview',
      createId: () => crypto.randomUUID(),
      createTunnel: (connection, config) => {
        const tunnel = new WebMappingTunnel(connection, config);
        tunnels.set(config.mappingId, tunnel);
        return { resolve: tunnel.resolve, close: async () => {
          await tunnel.close();
          if (tunnels.get(config.mappingId) === tunnel) tunnels.delete(config.mappingId);
        } };
      },
    });
    return { service, tunnels };
  }, [client, scope]);
  const { service } = manager;
  const entries = useSyncExternalStore(service.subscribe, service.snapshot);
  useEffect(() => { service.setConnected(connected); }, [service, connected]);
  useEffect(() => service.dispose, [service]);
  useEffect(() => { savePortMappings(scope, entries); }, [scope, entries]);
  return { ...manager, entries };
}
