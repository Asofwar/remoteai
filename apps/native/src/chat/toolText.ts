import { messageContent } from '../../../../shared/chat/messageDetails';
import type { Item } from './types';

/** Reasoning may carry a concise summary and a separate body; keep both readable. */
export function toolText(item: Item): string {
  const content = messageContent(item);
  const summary = item.summary?.join('\n\n') ?? '';
  if (item.type === 'reasoning') return [...new Set([summary, content].filter(Boolean))].join('\n\n');
  return content || item.review || summary;
}
