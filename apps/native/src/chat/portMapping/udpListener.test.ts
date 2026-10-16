import dgram from 'node:dgram';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { listenUdp } from './udpListener';
import { UDP_MAX_DATAGRAM, UDP_QUEUE_SIZE,
  type DatagramEndpoint } from '../../../../../shared/port-mapping/udpTunnel';

vi.mock('react-native-udp', () => ({ default: dgram }));
vi.mock('react-native', () => ({ NativeModules: { UdpSockets: {} } }));
vi.mock('expo-crypto', () => ({ randomUUID }));
const background = vi.hoisted(() => ({ release: vi.fn(async () => {}) }));
vi.mock('../backgroundConnection', () => ({ retainPortMappingConnection: async () => background.release }));
const sockets: dgram.Socket[] = [];
const endpoints: DatagramEndpoint[] = [];
afterEach(async () => {
  await Promise.all(endpoints.splice(0).map(endpoint => endpoint.close()));
  for (const socket of sockets.splice(0)) socket.close();
  vi.clearAllMocks();
});

async function socket() {
  const result = dgram.createSocket('udp4'); sockets.push(result);
  await new Promise<void>(resolve => result.bind(0, '127.0.0.1', resolve));
  return result;
}
async function port() {
  const reserved = await socket();
  const result = reserved.address().port;
  sockets.splice(sockets.indexOf(reserved), 1);
  await new Promise<void>(resolve => reserved.close(resolve));
  return result;
}
const send = (sender: dgram.Socket, data: Buffer, target: number) =>
  new Promise<void>((resolve, reject) => sender.send(data, target, '127.0.0.1', error => error ? reject(error) : resolve()));

it('preserves binary and empty datagrams, routes replies to their client, and releases pending reads', async () => {
  const localPort = await port();
  const endpoint = await listenUdp(localPort); endpoints.push(endpoint);
  const clients = [await socket(), await socket()];
  const peers = [];
  for (const [index, bytes] of [Buffer.alloc(0), Buffer.from([0, 255]), Buffer.alloc(UDP_MAX_DATAGRAM, 139)].entries()) {
    const client = clients[index % 2];
    await send(client, bytes, localPort);
    const [packet] = await endpoint.read();
    expect(Buffer.from(packet.data, 'base64')).toEqual(bytes);
    peers.push(packet.peer);
    const reply = new Promise<Buffer>(resolve => client.once('message', resolve));
    await endpoint.write([packet]);
    expect(await reply).toEqual(bytes);
  }
  expect(peers[0]).not.toBe(peers[1]); expect(peers[0]).toBe(peers[2]);
  const pending = expect(endpoint.read()).rejects.toThrow('closed');
  await endpoint.close(); await pending;
  const restarted = await listenUdp(localPort); endpoints.push(restarted);
  expect(background.release).toHaveBeenCalledTimes(1);
});

it('rejects occupied ports and releases the background lease on failed bind', async () => {
  const occupied = await socket();
  await expect(listenUdp(occupied.address().port)).rejects.toThrow('本地端口已被占用');
  expect(background.release).toHaveBeenCalledTimes(1);
});

it('bounds queued datagrams and ignores unknown reply destinations', async () => {
  const localPort = await port();
  const endpoint = await listenUdp(localPort); endpoints.push(endpoint);
  const client = await socket();
  const received = vi.fn(); client.on('message', received);
  for (let index = 0; index < UDP_QUEUE_SIZE + 10; index++) await send(client, Buffer.from([index]), localPort);
  await new Promise(resolve => setTimeout(resolve, 50));
  let count = 0;
  while (count < UDP_QUEUE_SIZE) count += (await endpoint.read()).length;
  expect(count).toBe(UDP_QUEUE_SIZE);
  await endpoint.write([{ peer: 'forged-peer', data: 'AA==' }]);
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(received).not.toHaveBeenCalled();
  const pending = expect(endpoint.read()).rejects.toThrow('closed');
  await endpoint.close(); await pending;
});
