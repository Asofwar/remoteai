import { expect, it } from 'vitest';
import { DatagramQueue, UDP_MAX_BATCH, UDP_MAX_BATCH_BYTES, UDP_MAX_DATAGRAM,
  UDP_QUEUE_BYTES, UDP_QUEUE_SIZE } from '../../../../../../shared/port-mapping/datagrams';

it('retains a 128-packet burst with peer boundaries and drains it in two batches', () => {
  const queue = new DatagramQueue();
  const packets = Array.from({ length: 128 }, (_, index) => ({ peer: `peer-${index % 4}`, data: btoa(String(index)) }));
  for (const packet of packets) expect(queue.push(packet, 3)).toBe(true);
  expect(queue.take()).toEqual(packets.slice(0, UDP_MAX_BATCH));
  expect(queue.take()).toEqual(packets.slice(UDP_MAX_BATCH));
  expect(queue.length).toBe(0);
});

it('bounds empty packets by count and large packets by bytes, then reuses capacity', () => {
  const queue = new DatagramQueue();
  for (let i = 0; i < UDP_QUEUE_SIZE; i++) expect(queue.push({ peer: 'p', data: '' }, 0)).toBe(true);
  expect(queue.push({ peer: 'p', data: '' }, 0)).toBe(false);
  queue.clear();
  const data = btoa('x'.repeat(UDP_MAX_DATAGRAM));
  const maximum = Math.floor(UDP_QUEUE_BYTES / UDP_MAX_DATAGRAM);
  for (let i = 0; i < maximum; i++) expect(queue.push({ peer: 'p', data }, UDP_MAX_DATAGRAM)).toBe(true);
  expect(queue.push({ peer: 'p', data }, UDP_MAX_DATAGRAM)).toBe(false);
  const batch = queue.take();
  expect(batch.length).toBe(Math.floor(UDP_MAX_BATCH_BYTES / UDP_MAX_DATAGRAM));
  expect(queue.push({ peer: 'p', data }, UDP_MAX_DATAGRAM)).toBe(true);
});
