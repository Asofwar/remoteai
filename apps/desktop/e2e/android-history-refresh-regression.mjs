import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adb, apiUrl, output, prepare, serverState, waitFor, waitText, tap, input, screenshot, hasText, nodes }
  from './android-chat-driver.mjs';

const HISTORY_DELAY_MS = 5000;
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function action(route, data) {
  const response = await fetch(`${apiUrl}/test/${route}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal(response.ok, true);
}

async function pull() {
  const current = await nodes();
  const header = current.find((node) => node['content-desc'] === '打开聊天列表');
  const composer = current.find((node) => node['content-desc'] === '聊天消息');
  assert.ok(header && composer, 'The chat is visible');
  const x = String(Math.round((composer.rect[0] + composer.rect[2]) / 2));
  await adb('shell', 'input', 'swipe', x, String(header.rect[3] + 100), x,
    String(composer.rect[1] - 70), '600');
}

// Ordinary background synchronization may finish before the queued pull; count only older-page requests.
const reads = async () => (await serverState()).operations
  .filter((entry) => entry.operation === 'syncHistory' && entry.window?.older);
async function retryHistory(name, anchorText, expectedItems = 0) {
  const before = (await reads()).length;
  const anchor = (await nodes()).find((node) => node.text === anchorText);
  await pull();
  await waitFor(async () => (await reads()).length > before, `${name}: history requested`);
  await screenshot(`${name}-refreshing`);
  assert.equal((await reads()).length, before + 1, 'One request per pull');
  assert.equal((await serverState()).synchronization.at(-1).changedItems, expectedItems);
  await pull();
  assert.equal((await reads()).length, before + 1, 'A pending request is shared by repeated pulls');
  await pause(HISTORY_DELAY_MS);
  assert.equal((await reads()).length, before + 1, 'A pull does not loop after reaching the beginning');
  await screenshot(`${name}-finished`);
  if (anchor) {
    const after = (await nodes()).find((node) => node.text === anchorText);
    assert.ok(after, 'The message being read stays visible');
    assert.ok(Math.abs(anchor.rect[1] - after.rect[1]) < 12, 'The reading position stays stable');
  }
  assert.equal(await hasText('演示项目'), false, 'A vertical pull does not open the chat drawer');
}

async function reopen() {
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await tap('打开聊天列表');
  await tap('移动端聊天体验');
}

const report = { startedAt: new Date().toISOString(), passed: false };
try {
  report.device = await prepare();
  await waitText('云端服务器地址');
  await input(0, apiUrl);
  await input(1, 'mobile-test@example.test');
  await input(2, 'local-test');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await tap('登录并查看');
  await waitText('聊天消息');
  await waitFor(async () => await hasText('P2P') || await hasText('Relay'), 'chat connected');
  await tap('打开聊天列表');
  await tap('移动端聊天体验');
  const anchor = '帮我整理今天的工作计划。';
  await waitText(anchor);
  assert.equal(await hasText('加载更早的消息'), false, 'Short history already reports no more messages');
  await action('history-delay', { milliseconds: HISTORY_DELAY_MS });
  await retryHistory('short-history', anchor);
  await retryHistory('repeated-history', anchor);
  await action('sidebar', { action: 'history-empty' });
  await reopen();
  await waitText('想一起完成什么？');
  await retryHistory('empty-history');
  await action('history-delay', { milliseconds: 0 });
  await action('sidebar', { action: 'history-compact' });
  await reopen();
  const compactAnswer = '处理完成，可以继续查看更早的消息。';
  await waitText(compactAnswer);
  await waitText('加载更早的消息');
  await action('history-delay', { milliseconds: HISTORY_DELAY_MS });
  await retryHistory('compact-page', compactAnswer, 10);
  report.passed = true;
  console.log('PASS: short/empty chats, compact history pagination, repeated pulls and stable reading position');
} catch (error) {
  report.error = String(error);
  await screenshot('history-refresh-failed');
  throw error;
} finally {
  await writeFile(path.join(output, 'history-refresh-report.json'), JSON.stringify(report, null, 2));
}
