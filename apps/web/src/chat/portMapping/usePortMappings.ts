import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { PortForwardingService, type ForwardingClient } from '../../../../../shared/port-mapping/service';
import { readPortMappings, savePortMappings } from '../../../../../shared/port-mapping/settings';
import { WebMappingTunnel } from './httpTunnel';
import { apiJson, getActiveSession } from '../../api';
import { mappingSyncScope, type MappingDocument } from '../../../../../shared/port-mapping/sync';
import { useMappingSync } from '../../../../../shared/port-mapping/useMappingSync';

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
  const exchange = useMemo(() => {
    const identity = mappingSyncScope(scope);
    if (!identity) return;
    return (document?: MappingDocument) => {
      const session = getActiveSession();
      if (session?.baseUrl !== identity.baseUrl || session.email !== identity.account) {
        return Promise.reject(new Error('Session changed'));
      }
      return apiJson<MappingDocument>(`/devices/${encodeURIComponent(identity.deviceId)}/port-mappings`,
        document ? { method: 'PUT', body: JSON.stringify(document) } : {});
    };
  }, [scope]);
  const syncStatus = useMappingSync(service, { scope, storage: localStorage, exchange });
  useEffect(() => { service.setConnected(connected); }, [service, connected]);
  useEffect(() => service.dispose, [service]);
  useEffect(() => { savePortMappings(scope, entries); }, [scope, entries]);
  return { ...manager, entries, syncStatus };
}
