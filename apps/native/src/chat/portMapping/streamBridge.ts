import { NativeModules } from 'react-native';
import { Buffer } from 'buffer';
import { toByteArray } from 'base64-js';
import type { MappingStreamBridge } from '../../../../../shared/port-mapping/streamClient';

interface NativeStreams {
  registerReceiver(id: string, epoch: string, key: string): Promise<void>;
  poll(id: string): Promise<{ data: string; requestId: string }[]>;
  close(id: string): void;
}
const native = NativeModules.PortMappingStreams as NativeStreams | undefined;

export const registerMappingStream: MappingStreamBridge | undefined = native?.registerReceiver ? async options => {
  const { identity, receiverKey, authenticated, failed } = options;
  let closed = false;
  await native.registerReceiver(identity.transferId, identity.epoch, Buffer.from(receiverKey).toString('hex'));
  const close = () => { if (!closed) { closed = true; native.close(identity.transferId); } };
  const poll = async () => {
    while (!closed) {
      const records = await native.poll(identity.transferId);
      if (closed) return;
      for (const record of records) {
        const bytes = toByteArray(record.data);
        if (record.requestId) authenticated(record.requestId, bytes);
        else throw new Error('Missing authenticated stream identity');
      }
    }
  };
  void poll().catch(() => { if (!closed) { close(); failed(); } });
  return close;
} : undefined;
