import { NativeModules } from 'react-native';
import { Buffer } from 'buffer';
import { toByteArray } from 'base64-js';
import type { MappingStreamBridge, NativeStreamProgress } from '../../../../../shared/port-mapping/streamClient';

interface NativeStreams {
  registerReceiver(id: string, epoch: string, key: string): Promise<void>;
  bind(id: string, request: string, socketId: number): Promise<void>;
  unbind(id: string, request: string): void;
  pollReceiver(id: string): Promise<{ records: { data: string; requestId: string }[];
    progress: (NativeStreamProgress & { requestId: string })[] }>;
  close(id: string): void;
}
const native = NativeModules.PortMappingStreams as NativeStreams | undefined;

export const registerMappingStream: MappingStreamBridge | undefined =
  native?.pollReceiver && native.bind ? async options => {
  const { identity, receiverKey, authenticated, progress, failed } = options;
  let closed = false;
  await native.registerReceiver(identity.transferId, identity.epoch, Buffer.from(receiverKey).toString('hex'));
  const close = () => { if (!closed) { closed = true; native.close(identity.transferId); } };
  const poll = async () => {
    while (!closed) {
      const result = await native.pollReceiver(identity.transferId);
      if (closed) return;
      for (const record of result.records) {
        const bytes = toByteArray(record.data);
        if (record.requestId) authenticated(record.requestId, bytes);
        else throw new Error('Missing authenticated stream identity');
      }
      for (const update of result.progress) progress(update.requestId, update);
    }
  };
  void poll().catch(() => { if (!closed) { close(); failed(); } });
  return { close, bind: (id, socketId) => native.bind(identity.transferId, id, socketId),
    unbind: id => { if (!closed) native.unbind(identity.transferId, id); } };
} : undefined;
