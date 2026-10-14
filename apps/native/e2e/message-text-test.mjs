import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, '.codex-tmp/message-text');
const serial = process.env.ANDROID_SERIAL;
assert.ok(serial, 'Set ANDROID_SERIAL to the test device');
const applicationId = 'com.codexswitch.mobile.messagetest';
const adb = async (...args) => (await exec('adb', ['-s', serial, ...args],
  { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })).stdout;

async function nodes() {
  await adb('shell', 'uiautomator', 'dump', '/sdcard/message-text-layout.xml');
  const xml = await adb('shell', 'cat', '/sdcard/message-text-layout.xml');
  return [...xml.matchAll(/<node\b([^>]*)>/g)].map(match => Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(value => [value[1], value[2]])));
}

function bounds(node) {
  assert.ok(node, 'Expected text view is present');
  return [...node.bounds.matchAll(/\d+/g)].map(value => Number(value[0]));
}

async function verify(name) {
  const tree = await nodes();
  const reference = bounds(tree.find(node => node['resource-id'] === 'overflow-reference'));
  const recovered = bounds(tree.find(node => node['resource-id'] === 'overflow-recovery'));
  const bubble = bounds(tree.find(node => node['resource-id'] === 'overflow-bubble'));
  assert.ok(recovered[3] - recovered[1] >= reference[3] - reference[1], 'Every native line fits after recovery');
  assert.ok(bubble[3] - recovered[3] >= recovered[0] - bubble[0] - 1, 'The bubble grows with its recovered text');
  assert.ok(tree.some(node => node.text === '.idea变化帮我加入忽略'), 'The reported message remains complete');
  await adb('shell', 'screencap', '-p', '/sdcard/message-text-result.png');
  await adb('pull', '/sdcard/message-text-result.png', path.join(output, `${name}.png`));
  return tree;
}

await mkdir(output, { recursive: true });
await adb('install', '-r', path.join(root,
  'apps/native/android/app/build/outputs/apk/release/message-text-fixture.apk'));
await adb('shell', 'am', 'force-stop', applicationId);
await adb('shell', 'am', 'start', '-W', '-n', `${applicationId}/com.codexswitch.mobile.MainActivity`);
const initial = await verify('normal');
const [left, top, right, bottom] = bounds(initial.find(node => node.text === '窄屏宽度'));
await adb('shell', 'input', 'tap', String((left + right) >> 1), String((top + bottom) >> 1));
await verify('narrow');
await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true,
  cases: ['actual native line height recovery', 'complete reported message', 'narrow bubble'] }, null, 2));
console.log('PASS: Android message line recovery and complete user text at both widths');
