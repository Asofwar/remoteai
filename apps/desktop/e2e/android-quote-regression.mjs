import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adb, apiUrl, output, prepare, nodes, tap, input, waitText, waitFor, hasText, screenshot, serverState }
  from './android-chat-driver.mjs';

const report = { startedAt: new Date().toISOString(), passed: false, cases: [] };
const chips = async () => (await nodes()).filter((node) => /^查看第 \d+ 条引用$/.test(node['content-desc'] ?? ''));
let headsUp;

async function selectionAction(action) {
  const result = await adb('shell', 'uiautomator', 'runtest', '/system/framework/android.test.base.jar',
    '/data/local/tmp/chat-hierarchy.jar', '-c', 'dev.codexswitch.testing.QuoteMenuTest', '-e', 'action', action);
  assert.ok(result.includes('OK (1 test)'), result);
}

async function hideKeyboard() {
  if (/mInputShown=true/.test(await adb('shell', 'dumpsys', 'input_method'))) {
    await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  }
}

async function selectText(text) {
  await hideKeyboard();
  const target = (await nodes()).find((node) => node.class === 'android.widget.TextView'
    && node.text.includes(text) && node.rect[3] > node.rect[1]);
  assert.ok(target, `visible source: ${text}`);
  // Paragraphs start in the drawer's edge-swipe area; long presses there must still reach Android's text menu.
  const x = String(Math.min(target.rect[0] + 60, target.rect[2] - 10));
  const y = String(Math.round((target.rect[1] + target.rect[3]) / 2));
  await adb('shell', 'input', 'swipe', x, y, x, y, '950');
  await selectionAction('全选');
  await screenshot(`quote-selection-${report.cases.length}`);
  return target.text;
}

async function addQuote(text, count) {
  const selected = await selectText(text);
  await selectionAction('引用');
  await waitFor(async () => (await chips()).length === count, `${count} independent quote chips`);
  report.cases.push({ name: `quote-${count}`, text: selected });
  await screenshot(`quote-chips-${count}`);
  return selected;
}

async function checkClipboard(copied) {
  await input(0, 'clipboard-placeholder');
  await adb('shell', 'input', 'keycombination', 'KEYCODE_CTRL_LEFT', 'KEYCODE_A');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_PASTE');
  await waitFor(async () => (await nodes()).some((node) => node.class === 'android.widget.EditText'
    && node.text === copied), 'clipboard contains exactly the selected text');
  await adb('shell', 'input', 'keycombination', 'KEYCODE_CTRL_LEFT', 'KEYCODE_A');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_DEL');
  await hideKeyboard();
}

async function checkCopy(text = '检查项目进度') {
  await selectText(text);
  await selectionAction('复制');
  await checkClipboard(text);
  report.cases.push({ name: 'copy-and-select-all', passed: true });
}

async function checkDismiss(text) {
  await selectText(text);
  const current = await nodes();
  const source = current.find((node) => node.text.startsWith(text));
  const composer = current.find((node) => node.class === 'android.widget.EditText');
  const y = Math.round((source.rect[3] + composer.rect[1]) / 2);
  assert.ok(y > source.rect[3] && y < composer.rect[1], 'blank conversation space is visible');
  await adb('shell', 'input', 'tap', '540', String(y));
  const result = await adb('shell', 'uiautomator', 'runtest', '/system/framework/android.test.base.jar',
    '/data/local/tmp/chat-hierarchy.jar', '-c', 'dev.codexswitch.testing.QuoteMenuTest', '-e', 'absent', 'true');
  assert.ok(result.includes('OK (1 test)'), result);
  report.cases.push({ name: 'tap-blank-space-dismisses-selection', passed: true });
}

async function checkDrawerGesture() {
  const source = (await nodes()).find((node) => node.text.startsWith('这条回复用于'));
  assert.ok(source, 'source near the drawer edge is visible');
  const y = String(Math.round((source.rect[1] + source.rect[3]) / 2));
  await adb('shell', 'input', 'swipe', '100', y, '810', y, '350');
  await waitText('搜索聊天');
  await adb('shell', 'input', 'swipe', '810', y, '100', y, '350');
  await waitFor(async () => !(await hasText('搜索聊天')), 'swipe closes drawer');
  report.cases.push({ name: 'text-selection-preserves-edge-swipe', passed: true });
}

try {
  report.device = await prepare();
  // Reply notifications can take focus from Android's selection toolbar while this test is interacting with it.
  headsUp = await adb('shell', 'settings', 'get', 'global', 'heads_up_notifications_enabled');
  await adb('shell', 'settings', 'put', 'global', 'heads_up_notifications_enabled', '0');
  await waitText('云端服务器地址');
  await input(0, apiUrl);
  await input(1, 'mobile-test@example.test');
  await input(2, 'local-test');
  await hideKeyboard();
  await tap('登录并查看');
  await waitText('打开聊天列表');
  await waitFor(async () => await hasText('P2P') || await hasText('Relay'), 'connected');
  await tap('打开聊天列表');
  await waitText('移动端聊天体验');
  await tap('移动端聊天体验');
  await waitText('检查项目进度');
  await checkCopy();
  const first = await addQuote('检查项目进度', 1);
  const second = await addQuote('处理需要确认的事项', 2);
  await hideKeyboard();
  await tap('查看第 1 条引用');
  await waitText('关闭引用详情');
  await waitText(first);
  await screenshot('quote-details');
  await tap('复制引用');
  await tap('关闭引用详情');
  await checkClipboard(first);
  await tap('移除第 2 条引用');
  assert.equal((await chips()).length, 1);
  await addQuote('处理需要确认的事项', 2);
  await addQuote('检查项目进度', 2);
  await input(0, 'Explain both quotes.');
  await tap('发送消息');
  await waitFor(async () => (await serverState()).operations.some((entry) => entry.operation === 'send'), 'sent');
  const sent = (await serverState()).operations.find((entry) => entry.operation === 'send');
  assert.equal(sent.text, `引用 AI 回答：\n> ${first}\n\n> ${second}\n\nExplain both quotes.`);
  await waitFor(async () => (await chips()).length === 0, 'submitted quotes cleared');
  await hideKeyboard();
  await waitText('这条回复用于验证实际移动端的收发和显示。');
  await tap('查看消息第 2 条引用');
  await waitText('关闭引用详情');
  await waitText(second);
  await screenshot('quote-sent-details');
  await tap('关闭引用详情');
  assert.ok((await nodes()).some((node) => node.text === 'Explain both quotes.'));
  await screenshot('quote-sent');
  report.cases.push({ name: 'preview-remove-deduplicate-and-send', passed: true });
  await waitText('const connected = true;');
  await checkDismiss('这条回复用于验证实际移动端的收发和显示。');
  await checkCopy('这条回复用于验证实际移动端的收发和显示。');
  await tap('复制代码');
  await checkClipboard('const connected = true;\n');
  await addQuote('const connected = true;', 1);
  await hideKeyboard();
  await tap('打开聊天列表');
  await waitText('新聊天');
  await tap('新聊天');
  assert.equal((await chips()).length, 0, 'a new chat has no quotes from the previous chat');
  await tap('打开聊天列表');
  await waitText('移动端聊天体验');
  await tap('移动端聊天体验');
  assert.equal((await chips()).length, 0, 'returning does not revive a discarded quote draft');
  report.cases.push({ name: 'highlighted-code-and-conversation-scope', passed: true });
  await waitText('查看消息第 1 条引用');
  await tap('查看消息第 1 条引用');
  await waitText(first);
  await tap('关闭引用详情');
  report.cases.push({ name: 'sent-quote-chips-survive-history-reload', passed: true });
  await checkDrawerGesture();
  const logs = await adb('logcat', '-d', '-s', 'ReactNativeJS:E', 'AndroidRuntime:E');
  assert.doesNotMatch(logs, /FATAL EXCEPTION|TypeError|ReferenceError/);
  report.passed = true;
} catch (error) {
  report.error = String(error);
  await screenshot('quote-regression-failed');
  throw error;
} finally {
  if (headsUp !== undefined) {
    if (headsUp === 'null') await adb('shell', 'settings', 'delete', 'global', 'heads_up_notifications_enabled');
    else await adb('shell', 'settings', 'put', 'global', 'heads_up_notifications_enabled', headsUp);
  }
  await writeFile(path.join(output, 'quote-report.json'), JSON.stringify(report, null, 2));
}
