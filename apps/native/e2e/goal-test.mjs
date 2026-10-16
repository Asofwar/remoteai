import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, '.codex-tmp/goal-native');
const serial = process.env.ANDROID_SERIAL;
assert.ok(serial, 'Set ANDROID_SERIAL to the test device');
const applicationId = 'com.codexswitch.mobile.goaltest';
const adb = async (...args) => (await exec('adb', ['-s', serial, ...args],
  { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })).stdout;
const pause = () => new Promise(resolve => setTimeout(resolve, 400));
const decode = text => text.replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number(value)))
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function nodes() {
  await adb('shell', 'uiautomator', 'dump', '/sdcard/goal-layout.xml');
  const xml = await adb('shell', 'cat', '/sdcard/goal-layout.xml');
  return [...xml.matchAll(/<node\b([^>]*)>/g)].map(match => Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(value => [value[1], decode(value[2])])));
}
const matches = (node, label) => node.text === label || node['content-desc'] === label;
async function find(label) {
  const deadline = Date.now() + 15_000;
  do {
    const target = (await nodes()).find(node => matches(node, label));
    if (target) return target;
    await pause();
  } while (Date.now() < deadline);
  throw new Error(`Control not visible: ${label}`);
}
const bounds = node => [...node.bounds.matchAll(/\d+/g)].map(value => Number(value[0]));
async function tap(label) {
  const [left, top, right, bottom] = bounds(await find(label));
  await adb('shell', 'input', 'tap', String((left + right) >> 1), String((top + bottom) >> 1));
}
async function screenshot(name) {
  await adb('shell', 'screencap', '-p', '/sdcard/goal-result.png');
  await adb('pull', '/sdcard/goal-result.png', path.join(output, `${name}.png`));
}
async function verifyGoal(name) {
  const preview = bounds(await find('查看目标'));
  const remove = bounds(await find('移除目标'));
  assert.ok(preview[2] <= remove[0], 'Viewing and removing have separate touch targets');
  await screenshot(`${name}-preview`);
  await tap('聊天消息');
  await tap('查看目标');
  await find('目标详情');
  await find('进行中');
  const content = (await nodes()).find(node => node.text.startsWith('完成聊天界面测试，'));
  assert.ok(content?.text.endsWith('同时验证键盘展开时的点击，以及移除目标按钮。'), 'Full goal is readable');
  assert.ok(content.text.includes('\n'), 'Line breaks are preserved');
  await screenshot(`${name}-details`);
  await tap('关闭目标详情');
  assert.equal((await find('移除次数')).text, '0', 'Viewing does not remove the goal');
  return { preview, remove };
}

await mkdir(output, { recursive: true });
await adb('install', '-r', path.join(root, 'apps/native/android/app/build/outputs/apk/release/goal-fixture.apk'));
await adb('shell', 'am', 'force-stop', applicationId);
await adb('shell', 'am', 'start', '-W', '-n', `${applicationId}/com.codexswitch.mobile.MainActivity`);
try {
  const normal = await verifyGoal('normal');
  await tap('切换窄屏');
  const narrow = await verifyGoal('narrow');
  assert.ok(narrow.preview[2] - narrow.preview[0] < normal.preview[2] - normal.preview[0]);
  assert.ok(narrow.preview[3] - narrow.preview[1] >= normal.preview[3] - normal.preview[1]);
  await tap('移除目标');
  assert.equal((await find('移除次数')).text, '1');
  assert.ok(!(await nodes()).some(node => matches(node, '目标详情')));
  await tap('切换草稿');
  await tap('聊天消息');
  await adb('shell', 'input', 'text', 'draft-goal');
  await tap('查看目标');
  await find('目标模式');
  await find('draft-goal');
  await tap('关闭目标模式');
  assert.equal((await find('聊天消息')).text, 'draft-goal', 'Viewing preserves the unsent draft');
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, normal, narrow }, null, 2));
  console.log('PASS: native goal wraps, opens with keyboard, preserves drafts and removes independently');
} finally { await adb('shell', 'am', 'force-stop', applicationId); }
