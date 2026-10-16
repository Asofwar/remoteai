const MAX_STORAGE_BYTES = 5 * 1024 * 1024;
const AREAS = ['localStorage', 'sessionStorage'] as const;
type StorageArea = typeof AREAS[number];
type StorageChange = { area?: unknown; operation?: unknown; key?: unknown; value?: unknown };

/** Temporary storage belongs to one open preview; it never reads or writes the host's storage. */
export class PreviewStorage {
  private readonly areas = { localStorage: new Map<string, string>(), sessionStorage: new Map<string, string>() };

  snapshot() {
    return { limit: MAX_STORAGE_BYTES,
      localStorage: [...this.areas.localStorage], sessionStorage: [...this.areas.sessionStorage] };
  }

  apply(input: StorageChange) {
    if (!AREAS.includes(input.area as StorageArea)) return;
    const entries = this.areas[input.area as StorageArea];
    if (input.operation === 'clear') { entries.clear(); return; }
    if (typeof input.key !== 'string') return;
    if (input.operation === 'remove') { entries.delete(input.key); return; }
    if (input.operation !== 'set' || typeof input.value !== 'string') return;
    let bytes = (input.key.length + input.value.length) * 2;
    for (const [key, value] of entries) if (key !== input.key) bytes += (key.length + value.length) * 2;
    if (bytes <= MAX_STORAGE_BYTES) entries.set(input.key, input.value);
  }
}
