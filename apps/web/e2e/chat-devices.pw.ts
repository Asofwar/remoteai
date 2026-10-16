import { expect, test, type Page } from '@playwright/test';
import type { RemoteDevice } from '../src/types';
import { connect, fixtureUrl, login, navigate, openChatList, operationCount, screenshot, state } from './chat-helpers';

const STORAGE_PREFIX = 'codex-switch.web.last-connected-device.v1';
const COMPUTER = 'computer';
const LAPTOP = 'laptop';

function computers(): RemoteDevice[] {
  return [
    { deviceId: 'offline', name: '离线电脑', online: false },
    { deviceId: COMPUTER, name: '我的工作电脑', online: true },
    { deviceId: LAPTOP, name: '另一台电脑', online: true },
  ].map((device) => ({ ...device, platform: 'Windows', capabilities: [],
    localProxyRunning: false, lastSeenAt: new Date().toISOString() }));
}

async function provideComputers(page: Page, devices: () => RemoteDevice[]) {
  let publish = () => {};
  // The local chat fixture routes every device ID to the same emulated computer.
  await page.route('**/devices', (route) => route.fulfill({ json: { devices: devices() } }));
  await page.routeWebSocket('**/device-switch', (socket) => {
    publish = () => socket.send(JSON.stringify({ type: 'devices-snapshot', devices: devices() }));
    socket.onMessage(() => publish());
  });
  return () => publish();
}

async function rememberedComputer(page: Page) {
  return page.evaluate((prefix) => {
    const session = JSON.parse(localStorage.getItem('codex-switch.web.session.v1') ?? '{}');
    const key = `${prefix}.${encodeURIComponent(`${session.baseUrl}|${session.email.toLowerCase()}`)}`;
    return localStorage.getItem(key);
  }, STORAGE_PREFIX);
}

async function connectedTo(page: Page, name: string) {
  await expect(page.getByRole('button', { name: '选择电脑', exact: true })).toContainText(name);
  await expect(page.getByRole('status').filter({ hasText: /P2P|Relay/ })).toBeVisible({ timeout: 20_000 });
}

async function chooseLaptop(page: Page) {
  await page.getByRole('button', { name: '选择电脑', exact: true }).click();
  await page.getByRole('button', { name: '另一台电脑 在线', exact: true }).click();
}

async function chooseComputer(page: Page) {
  await page.getByRole('button', { name: '选择电脑', exact: true }).click();
  await page.getByRole('button', { name: '我的工作电脑 在线', exact: true }).click();
}

test.beforeEach(async ({ request }) => {
  await request.post(`${fixtureUrl}/test/reset`);
});

for (const transport of ['P2P', 'Relay']) {
  test(`retains both device sessions, conversation and drafts over ${transport}`, async ({ page, request }, info) => {
    if (transport === 'Relay') await page.addInitScript(() => {
      window.RTCPeerConnection = class {
        constructor() { throw new Error('Direct transport disabled for the relay regression'); }
      } as unknown as typeof RTCPeerConnection;
    });
    await provideComputers(page, computers);
    await login(page);
    await connect(page);
    await connectedTo(page, '我的工作电脑');
    await openChatList(page);
    await page.getByRole('button', { name: '移动端聊天体验', exact: true }).click();
    await expect(page.getByText('帮我整理今天的工作计划。')).toBeVisible();
    const input = page.getByRole('textbox', { name: '聊天消息' });
    await input.fill('工作电脑的草稿');
    await chooseLaptop(page);
    await connectedTo(page, '另一台电脑');
    await expect(input).toHaveValue('');
    await input.fill('另一台电脑的草稿');
    await expect.poll(async () => (await state(request)).connectedMobiles).toBe(2);
    const connections = (await state(request)).mobileConnections;
    const lists = await operationCount(request, 'list');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await chooseComputer(page);
      await connectedTo(page, '我的工作电脑');
      await expect(input).toHaveValue('工作电脑的草稿');
      await expect(page.getByRole('heading', { name: '移动端聊天体验', exact: true })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: transport })).toBeVisible();
      await chooseLaptop(page);
      await connectedTo(page, '另一台电脑');
      await expect(input).toHaveValue('另一台电脑的草稿');
    }
    expect((await state(request)).mobileConnections).toBe(connections);
    expect(await operationCount(request, 'list')).toBe(lists);
    await expect.poll(() => rememberedComputer(page)).toBe(LAPTOP);
    await request.post(`${fixtureUrl}/test/sidebar`, { data: { action: 'start' } });
    await request.post(`${fixtureUrl}/test/sidebar`, { data: { action: 'complete' } });
    await expect.poll(async () => (await state(request)).sidebar.readState['demo-chat']?.unread).toBe(true);
    await chooseComputer(page);
    await expect(input).toHaveValue('工作电脑的草稿');
    await expect.poll(async () => (await state(request)).sidebar.readState['demo-chat']?.unread).toBe(false);
    expect((await state(request)).mobileConnections).toBe(connections);
    await screenshot(page, info, `retained-devices-${transport}`);
  });
}

test('releases removed device sessions and closes every connection on logout', async ({ page, request }) => {
  let devices = computers();
  const publish = await provideComputers(page, () => devices);
  await login(page);
  await connect(page);
  await connectedTo(page, '我的工作电脑');
  await chooseLaptop(page);
  await connectedTo(page, '另一台电脑');
  await expect.poll(async () => (await state(request)).connectedMobiles).toBe(2);
  devices = devices.filter(device => device.deviceId !== COMPUTER);
  publish();
  await expect.poll(async () => (await state(request)).connectedMobiles).toBe(1);
  devices = computers();
  publish();
  await chooseComputer(page);
  await connectedTo(page, '我的工作电脑');
  await expect.poll(async () => (await state(request)).connectedMobiles).toBe(2);
  await navigate(page, '设置');
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '退出登录', exact: true }).click();
  await expect.poll(async () => (await state(request)).connectedMobiles).toBe(0);
});

test('remembers the first successful connection and restores a manually chosen computer after reload',
  async ({ page }) => {
    await provideComputers(page, computers);
    await login(page);
    await connect(page);
    await connectedTo(page, '我的工作电脑');
    await expect.poll(() => rememberedComputer(page)).toBe(COMPUTER);
    await chooseLaptop(page);
    await connectedTo(page, '另一台电脑');
    await expect.poll(() => rememberedComputer(page)).toBe(LAPTOP);
    await page.reload();
    await connect(page);
    await connectedTo(page, '另一台电脑');
    await expect.poll(() => rememberedComputer(page)).toBe(LAPTOP);
  });

for (const unavailable of ['offline', 'removed'] as const) {
  test(`connects to the first online computer when the remembered computer is ${unavailable}`, async ({ page }) => {
    let devices = computers();
    await provideComputers(page, () => devices);
    await login(page);
    await connect(page);
    await connectedTo(page, '我的工作电脑');
    await chooseLaptop(page);
    await connectedTo(page, '另一台电脑');
    await expect.poll(() => rememberedComputer(page)).toBe(LAPTOP);
    devices = unavailable === 'removed' ? devices.filter((device) => device.deviceId !== LAPTOP)
      : devices.map((device) => ({ ...device, online: device.deviceId === COMPUTER }));
    await page.reload();
    await connect(page);
    await connectedTo(page, '我的工作电脑');
    await expect.poll(() => rememberedComputer(page)).toBe(COMPUTER);
  });
}

test('keeps the remembered computer when no computers are online and restores it when available', async ({ page }) => {
  let devices = computers();
  await provideComputers(page, () => devices);
  await login(page);
  await connect(page);
  await connectedTo(page, '我的工作电脑');
  await chooseLaptop(page);
  await connectedTo(page, '另一台电脑');
  await expect.poll(() => rememberedComputer(page)).toBe(LAPTOP);
  devices = devices.map((device) => ({ ...device, online: false }));
  await page.reload();
  await connect(page);
  await expect(page.getByRole('button', { name: '选择电脑', exact: true })).toHaveText('选择电脑，开始聊天');
  expect(await rememberedComputer(page)).toBe(LAPTOP);
  devices = computers();
  await page.reload();
  await connect(page);
  await connectedTo(page, '另一台电脑');
});

test('only updates the remembered computer after a successful connection', async ({ page }) => {
  let rejectConnection = true;
  await provideComputers(page, computers);
  await page.routeWebSocket('**/device-chat', (socket) => {
    if (!rejectConnection) { socket.connectToServer(); return; }
    socket.onMessage(() => socket.close({ code: 4004, reason: 'Unavailable test computer' }));
  });
  await login(page);
  await connect(page);
  await expect(page.getByRole('status')).toHaveText('连接未完成');
  expect(await rememberedComputer(page)).toBeNull();
  rejectConnection = false;
  await connectedTo(page, '我的工作电脑');
  await expect.poll(() => rememberedComputer(page)).toBe(COMPUTER);
  rejectConnection = true;
  await chooseLaptop(page);
  await expect(page.getByRole('status')).toHaveText('连接未完成');
  expect(await rememberedComputer(page)).toBe(COMPUTER);
  rejectConnection = false;
  await page.reload();
  await connect(page);
  await connectedTo(page, '我的工作电脑');
});

test('keeps computer preferences separate for each account', async ({ page }) => {
  await provideComputers(page, computers);
  await login(page);
  await connect(page);
  await connectedTo(page, '我的工作电脑');
  await chooseLaptop(page);
  await connectedTo(page, '另一台电脑');
  await expect.poll(() => rememberedComputer(page)).toBe(LAPTOP);
  await page.evaluate(() => {
    const key = 'codex-switch.web.session.v1';
    const session = JSON.parse(localStorage.getItem(key) ?? '{}');
    localStorage.setItem(key, JSON.stringify({ ...session, email: 'another@example.test' }));
  });
  await page.reload();
  await connect(page);
  await connectedTo(page, '我的工作电脑');
  await expect.poll(() => rememberedComputer(page)).toBe(COMPUTER);
  const preferences = await page.evaluate((prefix) => Object.keys(localStorage)
    .filter((key) => key.startsWith(prefix)).map((key) => localStorage.getItem(key)), STORAGE_PREFIX);
  expect(preferences.sort()).toEqual([COMPUTER, LAPTOP].sort());
});
