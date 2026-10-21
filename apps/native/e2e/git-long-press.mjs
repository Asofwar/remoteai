import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prepareHierarchy } from '../../desktop/e2e/android-hierarchy.mjs';

process.env.ANDROID_CHAT_OUTPUT ??= 'git-long-press-android';
const driver = await import('../../desktop/e2e/android-chat-driver.mjs');
const { adb, nodes, output, screenshot, tap, waitText } = driver;
const packageName = 'com.codexswitch.mobile.gittest';
const apk = process.env.ANDROID_GIT_APK
  ?? fileURLToPath(new URL('../android/app/build/outputs/apk/release/git-fixture.apk', import.meta.url));

async function hold(label) {
  const node = (await nodes()).find(node => node['content-desc'] === label || node.text === label);
  assert.ok(node, `Visible long-press target: ${label}`);
  const [left, top, right, bottom] = node.rect;
  const x = String(Math.round((left + right) / 2));
  const y = String(Math.round((top + bottom) / 2));
  await adb('shell', 'input', 'swipe', x, y, x, y, '800');
}

try {
  await mkdir(output, { recursive: true });
  await prepareHierarchy(driver);
  await adb('install', '-r', apk);
  await adb('shell', 'am', 'force-stop', packageName);
  await adb('shell', 'am', 'start', '-n', `${packageName}/com.codexswitch.mobile.MainActivity`);
  await waitText('打开工具'); await tap('打开工具'); await tap('Git');
  await waitText('查看 src/app.ts');
  await hold('查看 src/app.ts');
  await waitText('提交单个文件');
  assert.ok(!(await nodes()).some(node => node['content-desc'] === '返回上一层'));
  await screenshot('file-menu');
  await tap('回退单个文件');
  await waitText('确认回退');
  await screenshot('rollback-confirmation');
  await tap('取消');
  await waitText('查看 src/app.ts');
  await tap('查看 src/app.ts');
  await waitText('返回上一层'); await tap('返回上一层');

  await hold('展开或收起 src/chat');
  await waitText('提交文件夹内改动');
  await screenshot('folder-menu');
  await tap('提交文件夹内改动');
  await waitText('提交 2 个文件');
  await screenshot('folder-commit');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await tap('取消');
  await tap('提交记录');
  await waitText('72c48df0 增加 Git 工具');
  await hold('72c48df0 增加 Git 工具');
  await waitText('复制提交哈希');
  assert.ok(!(await nodes()).some(node => node['content-desc'] === '返回上一层'));
  await screenshot('commit-menu');
  await tap('复制提交哈希');
  await waitText('已复制');
  await hold('72c48df0 增加 Git 工具');
  await tap('重置当前分支到此提交…');
  await waitText('保留改动，取消暂存（Mixed）');
  await screenshot('reset-confirmation');
  await tap('取消');
  await hold('72c48df0 增加 Git 工具');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await waitText('首次提交');
  assert.ok(!(await nodes()).some(node => node['content-desc'] === '复制提交哈希'));
  await tap('关闭Git');
  await waitText('打开工具');
  console.log('PASS native long press, regular taps, file/folder confirmations, copy, reset and back dismissal');
} catch (error) {
  await screenshot('failure');
  throw error;
} finally {
  await adb('shell', 'am', 'force-stop', packageName);
}
