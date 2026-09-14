import { createRequire } from 'node:module';
import { once } from 'node:events';
import { test, expect } from '@playwright/test';
import type { WebSocketServer as Server } from 'ws';
import type { AddressInfo } from 'node:net';
import type { ChatSessions as Sessions } from '../../admin/src/modules/devices/chat/chat-sessions';
import type {} from './hot-chat-harness';

const require = createRequire(import.meta.url);
const { WebSocketServer } = createRequire(new URL('../../admin/package.json', import.meta.url))('ws') as {
  WebSocketServer: typeof Server;
};
const { ChatSessions } = require('../../admin/dist/modules/devices/chat/chat-sessions.js') as {
  ChatSessions: typeof Sessions;
};
let server: Server;
let sessions: Sessions;
let endpoint: string;
let available: boolean;
test.beforeEach(async () => {
  available = true;
  sessions = new ChatSessions();
  server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(server, 'listening');
  endpoint = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  server.on('connection', (socket) => {
    if (!available) { socket.terminate(); return; }
    let joined = false;
    socket.on('message', (raw) => {
      try {
        const frame = JSON.parse(raw.toString());
        if (joined) sessions.route(socket, frame);
        else {
          joined = true;
          sessions.join(socket, { role: frame.role, ownerId: 'owner', deviceId: 'computer',
            expiresAt: Date.now() + 300_000 }, frame, []);
        }
      } catch { socket.close(4001); }
    });
    socket.on('close', () => sessions.disconnect(socket));
  });
});
test.afterEach(async () => {
  for (const client of server.clients) client.terminate();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('keeps a real conversation alive through relay loss, coordinator restart and repeated P2P recovery',
  async ({ context }) => {
    test.setTimeout(75_000);
    const pc = await context.newPage();
    const phone = await context.newPage();
    await pc.goto(`/e2e/hot-chat-harness.html?role=desktop&socket=${encodeURIComponent(endpoint)}`);
    await expect(pc.locator('#status')).toHaveText('registered');
    await phone.goto(`/e2e/hot-chat-harness.html?role=mobile&socket=${encodeURIComponent(endpoint)}`);
    await expect(phone.locator('#status')).toHaveText('direct', { timeout: 12_000 });
    expect(await phone.evaluate(() => window.hotChat.request('first'))).toEqual({ text: 'first' });

    available = false;
    for (const client of server.clients) client.terminate();
    // Reset the in-memory registry as a real backend restart would.
    sessions = new ChatSessions();
    await phone.waitForTimeout(3500);
    expect(await phone.evaluate(() => window.hotChat.request('cloud unavailable')))
      .toEqual({ text: 'cloud unavailable' });
    await expect(phone.locator('#status')).toHaveText('direct');
    available = true;
    // The phone may retry before the PC registers and enter the next reconnect backoff.
    await expect.poll(() => server.clients.size, { timeout: 20_000 }).toBe(2);
    await phone.waitForTimeout(1500);

    const text = 'stream 中文😀'.repeat(20_000);
    const before = await phone.evaluate(() => window.hotChat.stats().beats);
    const streaming = pc.evaluate((value) => window.hotChat.stream(value), text);
    await phone.waitForTimeout(100);
    await phone.evaluate(() => window.hotChat.blockDirect(true));
    await expect(phone.locator('#status')).toHaveText('relay', { timeout: 5000 });
    await streaming;
    await expect.poll(() => phone.evaluate(() => window.hotChat.events.length)).toBe(1);
    expect(await phone.evaluate(() => window.hotChat.events[0])).toEqual({ text });
    expect(await phone.evaluate(() => window.hotChat.stats().beats)).toBeGreaterThan(before + 10);
    expect(await phone.evaluate(() => window.hotChat.request('relay request'))).toEqual({ text: 'relay request' });

    await phone.evaluate(() => window.hotChat.blockDirect(false));
    await expect(phone.locator('#status')).toHaveText('direct', { timeout: 18_000 });
    expect(await phone.evaluate(() => window.hotChat.request('restored'))).toEqual({ text: 'restored' });
    expect(await phone.evaluate(() => window.hotChat.stats().readyCount)).toBe(1);
    expect(await pc.evaluate(() => window.hotChat.stats().executions)).toBe(4);
    expect(await phone.evaluate(() => window.hotChat.errors)).toEqual([]);
    expect(await pc.evaluate(() => window.hotChat.errors)).toEqual([]);
    expect(await phone.evaluate(() => window.hotChat.modes)).not.toContain('offline');
    await phone.evaluate(() => window.hotChat.disconnect());
    await expect(pc.locator('#status')).toHaveText('offline');
  });
