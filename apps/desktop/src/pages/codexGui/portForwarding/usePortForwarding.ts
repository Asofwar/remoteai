import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { PortForwardingService, type ForwardingClient } from './service';
import { readPortMappings, savePortMappings } from './settings';

export function usePortForwarding(options: { client: ForwardingClient; scope: string; connected: boolean }) {
  const { client, scope, connected } = options;
  const service = useMemo(() => new PortForwardingService(client, readPortMappings(scope)), [client, scope]);
  const entries = useSyncExternalStore(service.subscribe, service.snapshot);
  useEffect(() => { service.setConnected(connected); }, [service, connected]);
  useEffect(() => service.dispose, [service]);
  useEffect(() => { savePortMappings(scope, entries); }, [scope, entries]);
  return { entries, service };
}
