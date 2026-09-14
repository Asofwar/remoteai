import type { Item, Thread, Turn } from '../types';
import { contentHash } from '../../../../../shared/remote-chat/historySync';

export const THREAD_CHAR_LIMIT = 2 * 1024 * 1024;
export const HISTORY_CHAR_LIMIT = 16 * 1024 * 1024;
export const IMAGE_CHAR_LIMIT = 24 * 1024 * 1024;
export const IMAGE_COUNT_LIMIT = 128;
export const THREAD_COUNT_LIMIT = 20;
const MAX_ROWS = 2000;

export interface MessageRecord {
  position: number; turn: string; item: string; turn_data: string; data: string; size: number; signature: string;
}

/** Weak keys reuse serialization for unchanged messages without retaining old conversations. */
export class RecordEncoder {
  private encoded = new WeakMap<Item, { data: string; hash: string }>();
  encode(thread: Thread): Omit<MessageRecord, 'position'>[] {
    const rows: Omit<MessageRecord, 'position'>[] = [];
    let size = 0;
    for (const turn of [...(thread.turns ?? [])].reverse()) {
      const { items, ...metadata } = turn;
      const turn_data = JSON.stringify(metadata);
      const turnHash = contentHash(turn_data);
      for (const item of [...(items.length ? items : [null])].reverse()) {
        const { data, hash } = item ? this.item(item) : { data: 'null', hash: '' };
        const chars = data.length + turn_data.length;
        // Retain a contiguous suffix. Never imply that a gap contains no messages.
        if (size + chars > THREAD_CHAR_LIMIT || rows.length >= MAX_ROWS) return rows.reverse();
        rows.push({ turn: turn.id, item: item?.id ?? '', turn_data, data,
          size: chars, signature: `${turnHash}:${hash}` });
        size += chars;
      }
    }
    return rows.reverse();
  }
  private item(item: Item) {
    const known = this.encoded.get(item);
    if (known) return known;
    const data = JSON.stringify(item);
    const encoded = { data, hash: contentHash(data) };
    this.encoded.set(item, encoded);
    return encoded;
  }
}

export function decodeRecords(metadata: string, rows: MessageRecord[]): Thread {
  const thread = JSON.parse(metadata) as Thread;
  if (!thread || typeof thread.id !== 'string') throw new Error('Invalid cached conversation');
  const turns: Turn[] = [];
  for (const row of rows) {
    let turn = turns[turns.length - 1];
    if (turn?.id !== row.turn) {
      turn = { ...JSON.parse(row.turn_data) as Turn, items: [] };
      if (turn.id !== row.turn) throw new Error('Invalid cached turn');
      turns.push(turn);
    }
    const item = JSON.parse(row.data) as Item | null;
    if (item) turn.items.push(item);
  }
  return { ...thread, turns };
}
