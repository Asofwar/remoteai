import { expect, test, type Page } from '@playwright/test';

const panel = (page: Page) => page.getByRole('region', { name: '端口转发设置' });
const entry = (page: Page, label: string) => panel(page).getByRole('article', { name: label });
async function add(page: Page, remotePort: number, localPort: number) {
  await panel(page).getByRole('spinbutton', { name: '远程端口' }).fill(String(remotePort));
  await panel(page).getByRole('spinbutton', { name: '本地端口' }).fill(String(localPort));
  await panel(page).getByRole('button', { name: '添加并启动' }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/port-forwarding-harness.html');
  await page.getByRole('button', { name: '端口转发', exact: true }).click();
});

test('multiple mappings, port conflicts, stop, copy and reconnect stay independent', async ({ page }) => {
  await add(page, 3000, 13000); await add(page, 5432, 15432);
  await expect(entry(page, '3000 → 13000').getByRole('status')).toHaveText('转发中');
  await expect(entry(page, '5432 → 15432').getByRole('status')).toHaveText('转发中');
  await entry(page, '3000 → 13000').getByRole('button', { name: '复制本地地址 3000 → 13000' }).click();
  expect(await page.evaluate(() => (window as unknown as { portForwardingFixture: { clipboard: string[] } })
    .portForwardingFixture.clipboard)).toEqual(['127.0.0.1:13000']);
  await entry(page, '3000 → 13000').getByRole('button', { name: '停止转发 3000 → 13000' }).click();
  await expect(entry(page, '3000 → 13000').getByRole('status')).toHaveText('已停止');
  await expect(entry(page, '5432 → 15432').getByRole('status')).toHaveText('转发中');
  await add(page, 8080, 9999);
  await expect(entry(page, '8080 → 9999').getByRole('alert')).toHaveText('本地端口已被占用，请换一个端口。');
  await entry(page, '8080 → 9999').getByRole('button', { name: '删除映射 8080 → 9999' }).click();
  await add(page, 8080, 15432);
  await expect(panel(page).getByRole('alert')).toHaveText('这个本地端口已有映射。');
  await page.getByRole('button', { name: '端口转发', exact: true }).click();
  await page.getByRole('button', { name: '断开连接', exact: true }).click();
  await page.getByRole('button', { name: '端口转发', exact: true }).click();
  await expect(entry(page, '5432 → 15432').getByRole('status')).toHaveText('已停止');
  await expect(panel(page).getByRole('button', { name: '启动转发 5432 → 15432' })).toBeDisabled();
  await page.getByRole('button', { name: '端口转发', exact: true }).click();
  await page.getByRole('button', { name: '重新连接', exact: true }).click();
  await page.getByRole('button', { name: '端口转发', exact: true }).click();
  await panel(page).getByRole('button', { name: '启动转发 5432 → 15432' }).click();
  await expect(entry(page, '5432 → 15432').getByRole('status')).toHaveText('转发中');
});

test('keeps mappings by computer, restores settings, and fits compact light and dark views', async ({ page }) => {
  await add(page, 3000, 13000);
  await page.screenshot({ path: '../../.codex-tmp/port-forwarding-light.png', animations: 'disabled' });
  const launcher = page.getByRole('button', { name: '端口转发', exact: true });
  const forwarding = await launcher.boundingBox();
  const desktop = await page.getByRole('button', { name: '打开远程桌面' }).boundingBox();
  expect(forwarding!.x + forwarding!.width).toBeLessThan(desktop!.x);
  await launcher.click(); await page.getByRole('button', { name: '切换电脑' }).click();
  await launcher.click(); await expect(panel(page)).toContainText('还没有端口映射');
  await launcher.click(); await page.getByRole('button', { name: '切换电脑' }).click();
  await launcher.click(); await expect(entry(page, '3000 → 13000').getByRole('status')).toHaveText('转发中');
  await page.reload(); await launcher.click();
  await expect(entry(page, '3000 → 13000').getByRole('status')).toHaveText('已停止');
  for (const width of [1280, 560]) {
    await page.setViewportSize({ width, height: 800 });
    const bounds = await panel(page).boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(400);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  }
  await launcher.click(); await page.getByRole('button', { name: '切换深色' }).click(); await launcher.click();
  await expect(entry(page, '3000 → 13000')).toBeVisible();
  await page.screenshot({ path: '../../.codex-tmp/port-forwarding-dark.png', animations: 'disabled' });
});
