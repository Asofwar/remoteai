import { invoke } from '@tauri-apps/api/core';
import type { MappingStreamBridge, NativeStreamProgress } from '../../../../../../shared/port-mapping/streamClient';
import { encodeNativeBulkBatch } from '../../../../../../shared/remote-chat/nativeBulkChannel';

interface Poll { records: { requestId: string; data: number[] }[];
  progress: (NativeStreamProgress & { requestId: string })[] }
const MAX_QUEUED_BYTES = 4 * 1024 * 1024;
const BATCH_RECORDS = 16;

/** Downloads stay in Rust; only upload control, consumed offsets and EOF cross this bridge. */
export const registerDesktopMappingStream: MappingStreamBridge = async options => {
  const id = options.identity.transferId;
  let closed = false;
  let pumping = false;
  let queued = 0;
  const records: Uint8Array[] = [];
  const command = (request: object) => invoke<void>('port_mapping_receiver', { request });
  await command({ type: 'register', id, epoch: options.identity.epoch,
    key: Array.from(options.receiverKey, byte => byte.toString(16).padStart(2, '0')).join('') });
  const close = (reason?: 'poll' | 'receive' | 'queue' | 'unbind') => {
    if (closed) return;
    closed = true; records.length = 0;
    void command({ type: 'close', id, ...(reason ? { reason } : {}) })
      .catch(() => { /* Native receiver leases also expire after renderer loss. */ });
  };
  const fail = (reason: 'poll' | 'receive' | 'queue' | 'unbind') => {
    if (!closed) { close(reason); options.failed(); }
  };
  const poll = async () => {
    while (!closed) {
      const result = await invoke<Poll>('port_mapping_poll', { id });
      if (closed) return;
      for (const record of result.records) options.authenticated(record.requestId, Uint8Array.from(record.data));
      for (const update of result.progress) options.progress(update.requestId, update);
    }
  };
  const pump = async () => {
    if (pumping || closed) return;
    pumping = true;
    try {
      while (!closed && records.length) {
        const batch = records.splice(0, BATCH_RECORDS);
        await invoke('port_mapping_receive', encodeNativeBulkBatch(batch));
        queued -= batch.reduce((sum, record) => sum + record.length, 0);
      }
    } finally { pumping = false; }
  };
  void poll().catch(() => fail('poll'));
  return { close,
    bind: (request, socket) => command({ type: 'bind', id, request, socket }),
    unbind: request => { if (!closed) void command({ type: 'unbind', id, request }).catch(() => fail('unbind')); },
    receive: record => {
      if (closed) return;
      queued += record.length;
      if (queued > MAX_QUEUED_BYTES) { fail('queue'); return; }
      records.push(record.slice());
      // Microtask coalescing keeps a bounded RTC batch rather than issuing one IPC call per record.
      void Promise.resolve().then(pump).catch(() => fail('receive'));
    },
  };
};
