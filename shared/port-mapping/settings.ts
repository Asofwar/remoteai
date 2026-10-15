import { mappingAddress, normalizeMappingHost } from './target';

export const MAX_PORT_MAPPINGS = 8;
export const MAX_PORT = 65535;
export interface PortMapping {
  id: string; remoteHost?: string; remotePort: number; localPort: number; updatedAt?: number;
}
export type MappingMode = 'tcp' | 'preview';
export interface MappingStorage {
  getItem: (key: string) => string | null; setItem: (key: string, value: string) => void;
}
const STORAGE_PREFIX = 'codex-port-forwarding:';

export function validPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_PORT;
}

export function readPortMappings(scope: string, storage: MappingStorage = localStorage,
  createId: () => string = () => crypto.randomUUID(), mode: MappingMode = 'tcp'): PortMapping[] {
  try {
    const saved: unknown = JSON.parse(storage.getItem(STORAGE_PREFIX + scope) ?? '[]');
    if (!Array.isArray(saved)) return [];
    const mappings: PortMapping[] = [];
    for (const value of saved) {
      const mapping = readMapping(value, createId);
      if (mapping && !mappings.some(saved => mappingConflicts(saved, mapping, mode))) mappings.push(mapping);
      if (mappings.length === MAX_PORT_MAPPINGS) break;
    }
    return mappings;
  } catch { return []; } // Unavailable storage must not prevent a temporary mapping.
}

export function readMapping(value: unknown, createId: () => string): PortMapping | undefined {
  if (!value || typeof value !== 'object') return;
  const entry = value as Record<string, unknown>;
  if (!validPort(entry.remotePort) || !validPort(entry.localPort)) return;
  if (entry.remoteHost !== undefined && typeof entry.remoteHost !== 'string') return;
  try {
    return { id: typeof entry.id === 'string' && /^[\w-]{1,64}$/.test(entry.id) ? entry.id : createId(),
      remoteHost: normalizeMappingHost(entry.remoteHost), remotePort: entry.remotePort, localPort: entry.localPort,
      ...(typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) ? { updatedAt: entry.updatedAt } : {}) };
  } catch { return; } // Discard invalid saved targets without losing the remaining mappings.
}

export function savePortMappings(scope: string, entries: readonly PortMapping[],
  storage: MappingStorage = localStorage) {
  try {
    storage.setItem(STORAGE_PREFIX + scope,
      JSON.stringify(entries.map(mappingConfig)));
  } catch { console.warn('Port forwarding settings could not be saved'); }
}

export function mappingConfig({ id, remoteHost, remotePort, localPort, updatedAt }: PortMapping): PortMapping {
  return { id, remoteHost: normalizeMappingHost(remoteHost), remotePort, localPort,
    ...(updatedAt === undefined ? {} : { updatedAt }) };
}

export function mappingConflicts(left: Omit<PortMapping, 'id'>, right: Omit<PortMapping, 'id'>,
  mode: MappingMode = 'tcp'): boolean {
  return mode === 'preview' ? mappingAddress(left) === mappingAddress(right) : left.localPort === right.localPort;
}
