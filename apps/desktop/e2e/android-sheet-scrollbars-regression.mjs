import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adb, apiUrl, output, prepare, nodes, tap, tapNode, input, waitText, waitFor, hasText, screenshot }
  from './android-chat-driver.mjs';

const report = { startedAt: new Date().toISOString(), cases: [], passed: false };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function seed(action) {
  const response = await fetch(`${apiUrl}/test/sidebar`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
  assert.equal(response.ok, true);
}

async function checkViewport(name, width) {
  await pause(700);
  const current = await nodes();
  const viewport = current.find((node) => node.class === 'android.widget.ScrollView');
  assert.ok(viewport, `${name}: scroll viewport exists`);
  assert.equal(viewport.rect[0], 0, `${name}: viewport starts at sheet edge`);
  assert.equal(viewport.rect[2], width, `${name}: viewport ends at sheet edge`);
  const label = current.find((node) => node.class === 'android.widget.TextView'
    && node.text && node.rect[1] >= viewport.rect[1] && node.rect[3] <= viewport.rect[3]);
  assert.ok(label, `${name}: readable content exists`);
  assert.ok(label.rect[0] > 0 && label.rect[2] < width, `${name}: text retains its inset`);
  report.cases.push({ name, viewport: viewport.rect, text: label.rect });
  await screenshot(name);
  console.log(`PASS ${name}: viewport ${viewport.rect.join(',')}`);
  return viewport;
}

async function login() {
  await waitText('云端服务器地址');
  await input(0, apiUrl);
  await input(1, 'mobile-test@example.test');
  await input(2, 'local-test');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await tap('登录并查看');
  await waitText('打开聊天列表');
  await waitFor(async () => await hasText('P2P') || await hasText('Relay'), 'connected');
}

async function openHistory() {
  await tap('打开聊天列表');
  await waitText('移动端聊天体验');
  await tap('移动端聊天体验');
}

async function workAndDetails(width) {
  await seed('history-compact');
  await openHistory();
  await waitText('查看处理过程');
  await tap('查看处理过程');
  const viewport = await checkViewport('work-list', width);
  const x = Math.round(width / 2);
  await adb('shell', 'input', 'swipe', String(x), String(viewport.rect[3] - 60),
    String(x), String(viewport.rect[1] + 60), '350');
  await waitText('关闭处理过程');
  await checkViewport('work-list-after-scroll', width);
  await tapNode((await nodes()).find((node) => node.class === 'android.widget.Button'
    && node['content-desc']?.includes('echo test')));
  await waitText('关闭执行命令');
  await checkViewport('command-details', width);
  await tap('返回上一层');
  await tap('关闭处理过程');
}

async function settingsAndAccounts(width) {
  const settings = (await nodes()).find((node) => node['content-desc']?.endsWith('，聊天设置'));
  await tapNode(settings);
  await tap('设置模型');
  await waitText('选择模型');
  await checkViewport('model-options', width);
  await tap('返回上一层');
  await tap('设置访问权限');
  await checkViewport('access-options', width);
  await tap('返回上一层');
  await tap('关闭聊天设置');
  await tap('打开聊天列表');
  await tap('打开头像菜单');
  await tap('切换账户');
  await waitText('演示账户一');
  await checkViewport('account-list', width);
  await tap('返回上一层');
  await tap('切换电脑');
  await waitText('关闭选择电脑');
  await checkViewport('device-list', width);
  await tap('关闭选择电脑');
}

async function fixedControlsAndWideScreen(width) {
  await tap('打开聊天列表');
  await tap('新聊天');
  await tap('选择项目');
  await waitText('F:');
  await checkViewport('project-folders', width);
  const wideWidth = 1600;
  try {
    await adb('shell', 'wm', 'size', `${wideWidth}x2424`);
    await pause(1500);
    // Android recreates the activity after a size change, so reopen the dismissed sheet.
    await waitFor(async () => await hasText('P2P') || await hasText('Relay'), 'wide screen connected');
    await tap('选择项目');
    await waitText('F:');
    await waitText('关闭选择项目');
    const viewport = await checkViewport('project-folders-wide', wideWidth);
    const choice = (await nodes()).find((node) => node.text === 'F:');
    assert.ok(choice, 'wide folder label is visible');
    assert.ok(choice.rect[0] > 200, 'wide folder content remains centered');
    assert.ok(choice.rect[2] < viewport.rect[2] - 200, 'readable width does not narrow the viewport');
  } finally {
    await adb('shell', 'wm', 'size', 'reset');
  }
  await pause(1000);
  await waitText('打开聊天列表');
  await tap('2FA', { last: true });
  await tap('手动添加');
  await checkViewport('totp-form', width);
  await tap('关闭添加 2FA 密钥');
}

try {
  report.device = await prepare();
  await login();
  const size = (await adb('shell', 'wm', 'size')).match(/(\d+)x(\d+)/);
  const width = Number(size[1]);
  await workAndDetails(width);
  await settingsAndAccounts(width);
  await fixedControlsAndWideScreen(width);
  const logs = await adb('logcat', '-d', '-s', 'ReactNativeJS:E', 'AndroidRuntime:E');
  assert.doesNotMatch(logs, /FATAL EXCEPTION|TypeError|ReferenceError/);
  report.passed = true;
} catch (error) {
  report.error = String(error);
  await screenshot('sheet-scrollbars-failed');
  throw error;
} finally {
  await writeFile(path.join(output, 'sheet-scrollbars-report.json'), JSON.stringify(report, null, 2));
}
