export const TOKENS_PER_K = 1_000;
export const CONTEXT_CAPACITY_PRESETS_K = [128, 272, 384, 400, 1000] as const;
export const MIN_CONTEXT_K = 1;
export const MAX_CONTEXT_K = 100_000;
export const CONTEXT_READ_OPERATION = 'contextSettingsRead';
export const CONTEXT_WRITE_OPERATION = 'contextSettingsWrite';

export interface ContextSettings { capacity: number | null }
export interface ContextSettingsApi {
  read: (threadId: string) => Promise<ContextSettings>;
  write: (threadId: string, settings: ContextSettings) => Promise<ContextSettings>;
}

export function parseContextCapacity(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(?:\.\d{1,3})?$/.test(trimmed)) return undefined;
  const capacity = Math.round(Number(trimmed) * TOKENS_PER_K);
  return Number.isSafeInteger(capacity) && capacity >= MIN_CONTEXT_K * TOKENS_PER_K
    && capacity <= MAX_CONTEXT_K * TOKENS_PER_K ? capacity : undefined;
}
