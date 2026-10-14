import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { randomUUID } from 'expo-crypto';
import Storage from 'expo-sqlite/kv-store';
import { PortForwardingService, type ForwardingClient } from '../../../../../shared/port-mapping/service';
import { readPortMappings, savePortMappings } from '../../../../../shared/port-mapping/settings';
import { NativeMappingTunnel } from './tunnel';

const storage = { getItem: (key: string) => Storage.getItemSync(key),
  setItem: (key: string, value: string) => Storage.setItemSync(key, value) };

export function usePortMappings(options: { client: ForwardingClient; scope: string; connected: boolean }) {
  const { client, scope, connected } = options;
  const service = useMemo(() => new PortForwardingService(client, readPortMappings(scope, storage, randomUUID), {
    createId: randomUUID, createTunnel: (connection, config) => new NativeMappingTunnel(connection, config),
  }), [client, scope]);
  const entries = useSyncExternalStore(service.subscribe, service.snapshot);
  useEffect(() => { service.setConnected(connected); }, [service, connected]);
  useEffect(() => service.dispose, [service]);
  useEffect(() => { savePortMappings(scope, entries, storage); }, [scope, entries]);
  return { entries, service };
}
