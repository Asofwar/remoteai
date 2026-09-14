import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adb, apiUrl, output, prepare, serverState, waitFor, waitText, tap, input, screenshot, hasText, nodes }
  from './android-chat-driver.mjs';

const report = { startedAt: new Date().toISOString(), passed: false };
const count = async () => (await serverState()).operations.filter((entry) => entry.operation === 'tokenSummary').length;
async function setDelay(milliseconds) {
  const response = await fetch(`${apiUrl}/test/token-summary-delay`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ milliseconds }) });
  assert.ok(response.ok);
}
async function openSummary() {
  await tap('打开聊天列表');
  await tap('打开头像菜单');
  await waitText('Token 汇总');
  await tap('Token 汇总');
  await waitText('返回聊天');
}
try {
  report.device = await prepare();
  await waitText('云端服务器地址');
  await input(0, apiUrl);
  await input(1, 'mobile-test@example.test');
  await input(2, 'local-test');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await tap('登录并查看');
  await waitText('打开聊天列表');
  await tap('打开聊天列表');
  await waitText('移动端聊天体验');
  await tap('移动端聊天体验');
  await waitFor(async () => (await hasText('P2P')) || (await hasText('Relay')), 'connected');
  await openSummary();
  await waitText('Token 类型累计');
  assert.equal(await hasText('2FA'), false, 'summary hides bottom tabs');
  await screenshot('token-summary-overview');
  const initial = await count();
  await waitFor(async () => await count() > initial, 'automatic summary refresh');
  for (const title of ['短 / 长上下文消耗', '普通 / 快速模式消耗', '每日 Token 热力图', '每日 Token 趋势',
    'Provider 消耗排行', '模型消耗排行', '账户消耗排行']) {
    await waitFor(async () => {
      if (await hasText(title)) return true;
      const scroll = (await nodes()).find((node) => node.class === 'android.widget.ScrollView');
      assert.ok(scroll);
      const [left, top, right, bottom] = scroll.rect;
      const x = String(Math.round((left + right) / 2));
      const destination = bottom - 80 - Math.round((bottom - top) * 0.35);
      await adb('shell', 'input', 'swipe', x, String(bottom - 80), x, String(destination), '350');
      return false;
    }, title);
    await screenshot(`token-summary-panel-${report.panels = (report.panels ?? 0) + 1}`);
  }
  await tap('返回聊天');
  await waitText('移动端聊天体验');
  assert.ok(await hasText('2FA'));
  await setDelay(15000);
  await openSummary();
  await waitText('正在加载汇总');
  const pendingCount = await count();
  await tap('返回聊天');
  await waitText('移动端聊天体验');
  report.returnedDuringRequest = true;
  assert.equal(await count(), pendingCount);
  await setDelay(0);
  await openSummary();
  await waitText('Token 类型累计');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await waitText('移动端聊天体验');
  assert.ok(await hasText('2FA'));
  report.passed = true;
  console.log('PASS: avatar entry, all summary panels, polling, tab hiding, pending-request return, Android Back');
} catch (error) {
  report.error = String(error);
  await screenshot('token-summary-failed');
  throw error;
} finally {
  await writeFile(path.join(output, 'token-summary-report.json'), JSON.stringify(report, null, 2));
}
