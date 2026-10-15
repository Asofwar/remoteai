import { NativeModules } from 'react-native';
import { Buffer } from 'buffer';
import type { MappingStreamBridge } from '../../../../../shared/port-mapping/streamClient';

interface NativeStreams {
  register(id: string, epoch: string): Promise<void>;
  poll(id: string): Promise<{ data: string; path: 'direct' | 'relay' }[]>;
  close(id: string): void;
}
const native = NativeModules.PortMappingStreams as NativeStreams | undefined;

export const registerMappingStream: MappingStreamBridge | undefined = native ? async ({ identity, receive, failed }) => {
  let closed = false;
  await native.register(identity.transferId, identity.epoch);
  const close = () => { if (!closed) { closed = true; native.close(identity.transferId); } };
  const poll = async () => {
    while (!closed) {
      const records = await native.poll(identity.transferId);
      if (closed) return;
      for (const record of records) receive(Buffer.from(record.data, 'base64'), record.path);
    }
  };
  void poll().catch(() => { if (!closed) { close(); failed(); } });
  return close;
} : undefined;
