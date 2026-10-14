export const MAX_PORT_MAPPINGS = 8;
export const MAX_PORT = 65535;
export interface PortMapping { id: string; remotePort: number; localPort: number }
const STORAGE_PREFIX = 'codex-port-forwarding:';

export function validPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_PORT;
}

export function readPortMappings(scope: string): PortMapping[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + scope) ?? '[]');
    if (!Array.isArray(saved)) return [];
    const mappings: PortMapping[] = [];
    for (const value of saved) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as Record<string, unknown>;
      if (!validPort(entry.remotePort) || !validPort(entry.localPort)
        || mappings.some(mapping => mapping.localPort === entry.localPort)) continue;
      mappings.push({ id: crypto.randomUUID(), remotePort: entry.remotePort, localPort: entry.localPort });
      if (mappings.length === MAX_PORT_MAPPINGS) break;
    }
    return mappings;
  } catch { return []; } // Unavailable storage must not prevent a temporary mapping.
}

export function savePortMappings(scope: string, entries: readonly PortMapping[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + scope,
      JSON.stringify(entries.map(({ remotePort, localPort }) => ({ remotePort, localPort }))));
  } catch { console.warn('Port forwarding settings could not be saved'); }
}
