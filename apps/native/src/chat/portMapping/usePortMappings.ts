import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { randomUUID } from 'expo-crypto';
import Storage from 'expo-sqlite/kv-store';
import { PortForwardingService, type ForwardingClient } from '../../../../../shared/port-mapping/service';
import { readPortMappings, savePortMappings } from '../../../../../shared/port-mapping/settings';
import { NativeMappingTunnel } from './tunnel';
import { protocolTunnel } from '../../../../../shared/port-mapping/protocolTunnel';
import { UdpMappingTunnel } from '../../../../../shared/port-mapping/udpTunnel';
import { listenUdp } from './udpListener';
import { adminRequest } from '../../api/client';
import type { AuthSession } from '../../types';
import { mappingSyncScope, type MappingDocument } from '../../../../../shared/port-mapping/sync';
import { useMappingSync } from '../../../../../shared/port-mapping/useMappingSync';

const storage = { getItem: (key: string) => Storage.getItemSync(key),
  setItem: (key: string, value: string) => Storage.setItemSync(key, value) };

export function usePortMappings(options: {
  client: ForwardingClient; scope: string; connected: boolean; session?: AuthSession;
}) {
  const { client, scope, connected } = options;
  const service = useMemo(() => new PortForwardingService(client, readPortMappings(scope, storage, randomUUID), {
    createId: randomUUID, createTunnel: (connection, config) => protocolTunnel(config.protocol, {
      tcp: () => new NativeMappingTunnel(connection, config),
      udp: () => new UdpMappingTunnel(connection, config, listenUdp),
    }),
  }), [client, scope]);
  const entries = useSyncExternalStore(service.subscribe, service.snapshot);
  const exchange = useMemo(() => {
    const identity = mappingSyncScope(scope);
    const session = options.session;
    if (!identity || !session || session.baseUrl !== identity.baseUrl || session.email !== identity.account) return;
    return (document?: MappingDocument) => adminRequest<MappingDocument>(session,
      `/devices/${encodeURIComponent(identity.deviceId)}/port-mappings`,
      document ? { method: 'PUT', body: JSON.stringify(document) } : {});
  }, [scope, options.session]);
  const syncStatus = useMappingSync(service, { scope, storage, exchange });
  useEffect(() => { service.setConnected(connected); }, [service, connected]);
  useEffect(() => service.dispose, [service]);
  useEffect(() => { savePortMappings(scope, entries, storage); }, [scope, entries]);
  return { entries, service, syncStatus };
}
