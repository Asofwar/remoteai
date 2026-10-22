import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { hierarchy, prepareHierarchy } from '../../desktop/e2e/android-hierarchy.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const serial = process.env.ANDROID_SERIAL;
assert.ok(serial, 'Set ANDROID_SERIAL to the test device');
const output = path.join(root, `.codex-tmp/message-text-${serial}`);
const applicationId = 'com.codexswitch.mobile.messagetest';
const FONT_SWEEP_COUNT = 49;
const adb = async (...args) => (await exec('adb', ['-s', serial, ...args],
  { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })).stdout;

async function nodes() {
  // Read without waiting for UI idleness: a layout loop is exactly what this regression checks.
  const xml = await hierarchy(adb);
  return [...xml.matchAll(/<node\b([^>]*)>/g)].map(match => Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(value => [value[1], value[2]])));
}

function bounds(node) {
  assert.ok(node, 'Expected text view is present');
  return [...node.bounds.matchAll(/-?\d+/g)].map(value => Number(value[0]));
}

async function verify(name) {
  const tree = await nodes();
  const singleLine = bounds(tree.find(node => node['resource-id'] === 'single-line-reference'));
  for (const text of ['编译msi和apk', '编译 msi 和 apk', '修复好了']) {
    const actual = bounds(tree.find(node => node.text === text));
    assert.ok(actual[3] - actual[1] <= singleLine[3] - singleLine[1] + 1,
      `${text} fits on one line at ${name} width`);
  }
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

async function verifyStable(initial) {
  const labels = ['编译msi和apk', '编译 msi 和 apk', '修复好了'];
  const positions = tree => labels.map(text => bounds(tree.find(node => node.text === text)));
  const expected = positions(initial);
  for (let sample = 0; sample < 6; sample++) {
    assert.deepEqual(positions(await nodes()), expected, 'Idle message bubbles do not resize or shift');
  }
}

async function waitForFixture() {
  for (let attempt = 0; attempt < 12; attempt++) {
    if ((await nodes()).some(node => node['resource-id'] === 'single-line-reference')) return;
  }
  throw new Error('Message fixture did not finish loading');
}

async function verifyFontSweep(tree) {
  const reference = bounds(tree.find(node => node['resource-id'] === 'single-line-reference'));
  const [left, top, right, bottom] = bounds(tree.find(node => node.text === 'Font sweep'));
  await adb('shell', 'input', 'tap', String((left + right) >> 1), String((top + bottom) >> 1));
  const checked = new Set();
  for (let page = 0; page < 24 && checked.size < FONT_SWEEP_COUNT; page++) {
    const current = await nodes();
    const [scrollLeft, scrollTop, scrollRight, scrollBottom] = bounds(current.find(node => node.scrollable === 'true'));
    for (const node of current.filter(node => /^sweep-\d+$/.test(node['resource-id']))) {
      const [, y, , end] = bounds(node);
      if (y <= scrollTop || end >= scrollBottom) continue;
      assert.ok(end - y <= reference[3] - reference[1] + 1,
        `${node['resource-id']}: a short italic word stays on one line`);
      checked.add(node['resource-id']);
    }
    if (checked.size < FONT_SWEEP_COUNT) {
      const x = String((scrollLeft + scrollRight) >> 1);
      await adb('shell', 'input', 'swipe', x, String(scrollBottom - 100),
        x, String((scrollTop + scrollBottom) >> 1), '1000');
    }
  }
  assert.equal(checked.size, FONT_SWEEP_COUNT, 'Every fractional font size was checked');
}

await mkdir(output, { recursive: true });
await prepareHierarchy({ adb, output });
await adb('install', '-r', process.env.MESSAGE_TEXT_APK ?? path.join(root,
  'apps/native/android/app/build/outputs/apk/release/message-text-fixture.apk'));
await adb('shell', 'am', 'force-stop', applicationId);
await adb('shell', 'am', 'start', '-W', '-n', `${applicationId}/com.codexswitch.mobile.MainActivity`);
await waitForFixture();
const initial = await verify('normal');
await verifyStable(initial);
const [left, top, right, bottom] = bounds(initial.find(node => node.text === '窄屏宽度'));
await adb('shell', 'input', 'tap', String((left + right) >> 1), String((top + bottom) >> 1));
const narrow = await verify('narrow');
await verifyStable(narrow);
await verifyFontSweep(narrow);
await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true,
  cases: ['actual native line height recovery', 'complete reported message', 'short messages stay on one line',
    'stable bubble bounds', 'narrow bubble', '49 italic font sizes stay on one line'] }, null, 2));
console.log('PASS: Android text recovery, single-line short messages and stable bubbles at both widths');
