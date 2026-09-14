import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { imagePreviewJourney } from './android-image-preview.mjs';
import { adb, apiUrl, output, prepare, waitFor, waitText, tap, input, hasText, send, screenshot, serverState }
  from './android-chat-driver.mjs';

const report = { passed: false, cases: [] };
try {
  report.device = await prepare();
  await waitFor(async () => (await adb('logcat', '-d', '-s', 'ReactNativeJS')).includes('Running "main"'),
    'release app starts', 60_000);
  await waitText('云端服务器地址');
  await input(0, apiUrl);
  await input(1, 'mobile-test@example.test');
  await input(2, 'local-test');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await tap('登录并查看');
  await waitText('聊天消息');
  await waitFor(async () => (await hasText('P2P')) || (await hasText('Relay')), 'connected');
  await tap('打开聊天列表');
  await tap('移动端聊天体验');
  await imagePreviewJourney();
  report.cases.push('local-and-remote-pinch-pan-rotate-save-close');
  console.log('PASS image preview gestures, rotation and saving');

  await send('test local image preview');
  await tap('放大查看：本地图片');
  await waitText('保存到相册');
  const response = await fetch(`${apiUrl}/test/sidebar`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) });
  assert.equal(response.ok, true);
  const result = await adb('shell', 'uiautomator', 'runtest', '/system/framework/android.test.base.jar',
    '/data/local/tmp/chat-hierarchy.jar', '-c', 'dev.codexswitch.testing.ImageGestureTest',
    '-e', 'label', '本地图片', '-e', 'direction', 'out');
  assert.ok(result.includes('OK (1 test)'), result);
  await screenshot('image-pinch-during-reply');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await waitText('暂停生成');
  await adb('shell', 'input', 'swipe', '500', '700', '500', '1600', '500');
  await adb('shell', 'input', 'swipe', '500', '1600', '500', '700', '500');
  await tap('暂停生成');
  await waitFor(async () => !(await hasText('暂停生成')), 'reply stops after scrolling');
  assert.deepEqual((await serverState()).streamErrors, []);
  report.cases.push('pinch-and-chat-scroll-during-reply');
  report.passed = true;
  console.log('PASS pinch and chat scrolling during an active reply');
} catch (error) {
  report.error = String(error);
  await screenshot('performance-failed');
  throw error;
} finally {
  await writeFile(path.join(output, 'performance-report.json'), JSON.stringify(report, null, 2));
}
