import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adb, apiUrl, output, prepare, waitFor, waitText, tap, input, nodes, screenshot, serverState, hasText }
  from './android-chat-driver.mjs';

const report = { passed: false, visits: 0 };
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
  const response = await fetch(`${apiUrl}/test/sidebar`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'history-pages' }) });
  assert.equal(response.ok, true);
  await tap('打开聊天列表');
  await tap('移动端聊天体验');
  await waitText('历史消息 35');
  const before = (await serverState()).synchronization.length;
  const loadedOlder = async () => (await serverState()).synchronization.slice(before)
    .some((entry) => entry.changedItems > 0);
  for (let attempt = 0; attempt < 8 && !await loadedOlder(); attempt++) {
    const scroll = (await nodes()).find((node) => node.scrollable === 'true');
    assert.ok(scroll);
    const [left, top, right, bottom] = scroll.rect;
    const x = String(Math.round((left + right) / 2));
    await adb('shell', 'input', 'swipe', x, String(top + 80), x, String(bottom - 80), '350');
  }
  await waitFor(loadedOlder, 'older messages loaded');
  for (let visit = 0; visit < 4; visit++) {
    await tap('打开聊天列表');
    await tap('新聊天');
    await waitText('想一起完成什么？');
    const count = (await serverState()).operations.length;
    await tap('打开聊天列表');
    await tap('移动端聊天体验');
    await waitText('历史消息 35');
    const reads = (await serverState()).operations.slice(count).filter((entry) => entry.operation === 'syncHistory');
    assert.ok(reads.length > 0);
    assert.ok(reads[0].known.turns.reduce((sum, turn) => sum + turn.items.length, 0) <= 10);
    report.visits++;
    console.log(`PASS cached conversation visit ${report.visits}`);
  }
  await screenshot('history-cache-reopened');
  assert.deepEqual((await serverState()).streamErrors, []);
  report.passed = true;
} catch (error) {
  report.error = String(error);
  await screenshot('history-cache-failed');
  throw error;
} finally {
  await writeFile(path.join(output, 'history-cache-report.json'), JSON.stringify(report, null, 2));
}
