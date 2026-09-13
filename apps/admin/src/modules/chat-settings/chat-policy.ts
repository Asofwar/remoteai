/** Public numeric contract shared by the admin form, chat clients and desktop host. */
export const CHAT_POLICY_FIELDS = {
  threadPageSize: { min: 1, max: 100, default: 50 },
  historyPageSize: { min: 1, max: 100, default: 10 },
  imageSourceMaxMb: { min: 1, max: 20, default: 20 },
  imageMaxEdge: { min: 256, max: 4096, default: 2048 },
  imageTargetKb: { min: 32, max: 2048, default: 512 },
  filePreviewMaxMb: { min: 1, max: 2, default: 2 },
  imagePreviewMaxMb: { min: 1, max: 20, default: 20 },
  fileDownloadMaxMb: { min: 1, max: 20, default: 20 },
} as const;

export type ChatPolicy = { [K in keyof typeof CHAT_POLICY_FIELDS]: number };
export const DEFAULT_CHAT_POLICY = Object.fromEntries(Object.entries(CHAT_POLICY_FIELDS)
  .map(([key, field]) => [key, field.default])) as ChatPolicy;

export function parseChatPolicy(value: unknown): ChatPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请填写完整的聊天设置。');
  const record = value as Record<string, unknown>;
  const policy = { ...DEFAULT_CHAT_POLICY };
  for (const key of Object.keys(CHAT_POLICY_FIELDS) as (keyof ChatPolicy)[]) {
    const field = CHAT_POLICY_FIELDS[key];
    const number = record[key];
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < field.min || number > field.max) {
      throw new Error('请在允许范围内填写整数。');
    }
    policy[key] = number;
  }
  return policy;
}
