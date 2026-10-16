import { expect, test, type APIRequestContext } from '@playwright/test';
import { navigate } from './chat-helpers';

const fixture = 'http://127.0.0.1:1491';
type Operation = { deviceId: string; accountId: string; action: string };
const operations = async (request: APIRequestContext): Promise<Operation[]> =>
  (await request.get(`${fixture}/test/usage`)).json();

test.beforeEach(async ({ page, request }) => {
  await request.post(`${fixture}/test/reset`);
  await page.goto('./');
  await page.getByRole('textbox', { name: '邮箱', exact: true }).fill('review@example.test');
  await page.getByRole('textbox', { name: '密码', exact: true }).fill('local-review');
  await page.getByRole('button', { name: '登录并查看' }).click();
  await page.getByRole('button', { name: '同意并登录' }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.getByText('欢迎回来', { exact: true })).toBeHidden();
  await navigate(page, '账号');
  await expect(page.getByRole('button', { name: '批量刷新用量' })).toBeEnabled();
  await request.post(`${fixture}/test/usage`, { data: {} });
});

test('refreshes all and individual usage on the PC without calling server usage APIs', async ({ page, request }, info) => {
  let serverUsageCalls = 0;
  await page.route('**/sync/accounts/*/usage', route => { serverUsageCalls++; return route.abort(); });
  await page.getByRole('button', { name: '批量刷新用量' }).click();
  await expect.poll(async () => (await operations(request)).length).toBe(4);
  await expect(page.locator('.account-row-meter b').first()).toHaveText('64%');
  expect((await operations(request)).every(item => item.deviceId === 'sample-pc' && item.action === 'refresh')).toBe(true);
  const banner = page.locator('.accounts-overview');
  expect(await banner.evaluate(node => getComputedStyle(node).backgroundImage)).toContain('linear-gradient');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if ((page.viewportSize()?.width ?? 0) < 600) await expect(page.locator('.account-switch').first()).toBeHidden();
  await page.screenshot({ path: info.outputPath('account-overview.png') });
  await page.locator('.account-row-main').first().click();
  await page.getByRole('button', { name: '刷新账号用量', exact: true }).click();
  await expect.poll(async () => (await operations(request)).length).toBe(5);
  expect((await operations(request)).at(-1)?.accountId).toBe('account-0');
  expect(serverUsageCalls).toBe(0);
});

test('uses the chat computer and falls back to the first online computer when it goes offline', async ({ page, request }) => {
  const { devices } = await (await request.get(`${fixture}/devices`)).json();
  const second = { ...devices[0], deviceId: 'second-pc', name: '第二台电脑' };
  await request.post(`${fixture}/test/devices`, { data: [devices[1], devices[0], second] });
  await navigate(page, '聊天');
  await page.getByRole('button', { name: '选择电脑', exact: true }).click();
  await page.getByRole('button', { name: '第二台电脑 在线', exact: true }).click();
  await expect(page.locator('.chat-connection-name:visible')).toHaveText('第二台电脑');
  await navigate(page, '账号');
  await page.getByRole('button', { name: '批量刷新用量' }).click();
  await expect.poll(async () => (await operations(request)).length).toBe(4);
  expect((await operations(request)).every(item => item.deviceId === 'second-pc')).toBe(true);
  await expect(page.getByRole('button', { name: '批量刷新用量' })).toBeEnabled();
  await request.post(`${fixture}/test/usage`, { data: {} });
  await request.post(`${fixture}/test/devices`, { data: [devices[1], devices[0], { ...second, online: false }] });
  await page.getByRole('button', { name: '消耗额度', exact: true }).click();
  await expect(page.locator('.quota-consumption-notice')).toContainText('我的工作电脑');
  await page.getByRole('button', { name: '消耗所选 4 个账号', exact: true }).click();
  await expect.poll(async () => (await operations(request)).length).toBe(4);
  expect((await operations(request)).every(item => item.deviceId === 'sample-pc' && item.action === 'consume')).toBe(true);
  await expect(page.locator('.account-row-meter b').first()).toHaveText('42%');
});

test('confirms selected accounts, keeps partial results, and does not repeat consumption', async ({ page, request }, info) => {
  await request.post(`${fixture}/test/usage`, { data: { failure: 'account-1', refreshFailure: 'account-2' } });
  await page.getByRole('button', { name: '消耗额度', exact: true }).click();
  await expect(page.locator('.quota-consumption-notice')).toContainText('此操作会产生真实用量');
  expect((await operations(request)).length).toBe(0);
  await page.getByRole('checkbox', { name: '取消全选' }).click();
  await expect(page.getByRole('button', { name: '请先选择账号' })).toBeDisabled();
  const checkboxes = page.locator('.quota-consumption-list').getByRole('checkbox');
  for (const index of [0, 1, 2]) await checkboxes.nth(index).click();
  await page.screenshot({ path: info.outputPath('quota-selection.png') });
  expect(await page.locator('.quota-consumption-notice').evaluate(node => node.getBoundingClientRect().width))
    .toBeLessThanOrEqual(400);
  await page.getByRole('button', { name: '消耗所选 3 个账号' }).click();
  await expect.poll(async () => (await operations(request)).length).toBe(3);
  await expect(page.locator('.quota-consumption')).toBeHidden();
  await expect(page.locator('.account-row-meter b').first()).toHaveText('42%');
  await expect(page.locator('.account-row').nth(1)).toContainText('电脑未确认额度消耗完成');
  await expect(page.locator('.account-row').nth(2)).toContainText('额度已消耗，但用量刷新失败');
  await page.getByRole('button', { name: '批量刷新用量' }).click();
  await expect.poll(async () => (await operations(request)).length).toBe(7);
  expect((await operations(request)).filter(item => item.action === 'consume')).toHaveLength(3);
});

test('keeps navigation responsive and prevents overlapping PC operations', async ({ page, request }) => {
  await request.post(`${fixture}/test/usage`, { data: { delay: 2500 } });
  await page.getByRole('button', { name: '批量刷新用量' }).click();
  await expect.poll(async () => (await operations(request)).length).toBe(4);
  await expect(page.getByRole('button', { name: '批量刷新用量' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '消耗额度', exact: true })).toBeDisabled();
  await navigate(page, '设置');
  await page.getByRole('button', { name: /关于 Remote AI/ }).click();
  await expect(page.getByText('Web 浏览器')).toBeVisible();
  expect(await operations(request)).toHaveLength(4);
});

test('reports unavailable computers without issuing quota commands', async ({ page, request }) => {
  const { devices } = await (await request.get(`${fixture}/devices`)).json();
  await request.post(`${fixture}/test/devices`, { data: devices.map((device: object) => ({ ...device, online: false })) });
  await page.getByRole('button', { name: '消耗额度', exact: true }).click();
  await expect(page.getByText('暂无在线电脑，请先在电脑上打开 Remote AI。', { exact: true })).toBeVisible();
  expect(await operations(request)).toHaveLength(0);
  await request.post(`${fixture}/test/devices`, { data: [{ ...devices[0], capabilities: [] }] });
  await page.getByRole('button', { name: '批量刷新用量' }).click();
  await expect(page.getByText('请先更新电脑上的 Remote AI，再操作账号用量。', { exact: true })).toBeVisible();
  expect(await operations(request)).toHaveLength(0);
});
