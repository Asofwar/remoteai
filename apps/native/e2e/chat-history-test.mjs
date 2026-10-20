import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { hierarchy, prepareHierarchy } from '../../desktop/e2e/android-hierarchy.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, '.codex-tmp/chat-history-android');
const serial = process.env.ANDROID_SERIAL;
assert.ok(serial, 'Set ANDROID_SERIAL to the test device');
const applicationId = 'com.codexswitch.mobile.scrolltest';
const adb = async (...args) => (await exec('adb', ['-s', serial, ...args],
  { encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })).stdout;

async function nodes() {
  const xml = await hierarchy(adb);
  await writeFile(path.join(output, 'latest-ui.xml'), xml);
  return [...xml.matchAll(/<node\b([^>]*)>/g)].map(match => Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(value => [value[1], value[2]])));
}

function bounds(node) {
  assert.ok(node, 'Expected view is present');
  return [...node.bounds.matchAll(/\d+/g)].map(value => Number(value[0]));
}

function requests(tree) {
  const label = tree.find(node => /^History requests \d+$/.test(node.text))?.text;
  assert.ok(label, 'History request counter is visible');
  return Number(label.split(' ').at(-1));
}

async function tap(label) {
  const deadline = Date.now() + 20_000;
  let target;
  do {
    target = (await nodes()).find(node => node.text === label);
    if (!target) await new Promise(resolve => setTimeout(resolve, 200));
  } while (!target && Date.now() < deadline);
  const [left, top, right, bottom] = bounds(target);
  await adb('shell', 'input', 'tap', String((left + right) >> 1), String((top + bottom) >> 1));
}

async function swipe(tree, distance) {
  const [left, top, right, bottom] = bounds(tree.find(node => node.class === 'android.widget.ScrollView'));
  const x = String((left + right) >> 1);
  const y = Math.round(top + (bottom - top) * 0.3);
  await adb('shell', 'input', 'swipe', x, String(y), x, String(y + distance), '700');
}

async function screenshot(name) {
  const { stdout } = await exec('adb', ['-s', serial, 'exec-out', 'screencap', '-p'],
    { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  await writeFile(path.join(output, `${name}.png`), stdout);
}

await mkdir(output, { recursive: true });
await prepareHierarchy({ adb, output });
const focus = (await adb('shell', 'dumpsys', 'window')).match(/mCurrentFocus=.* u0 ([\w.$]+\/[\w.$]+)/)?.[1];
try {
  await adb('install', '-r', path.join(root, 'apps/native/android/app/build/outputs/apk/release/chat-scroll-fixture.apk'));
  await adb('shell', 'am', 'force-stop', applicationId);
  await adb('shell', 'am', 'start', '-W', '-n', `${applicationId}/com.codexswitch.mobile.MainActivity`);
  await tap('short');
  let tree = await nodes();
  assert.equal(requests(tree), 0, 'Opening a short chat does not fetch the entire history');
  await screenshot('short-before');
  await swipe(tree, 240);
  tree = await nodes();
  assert.equal(requests(tree), 1, 'A downward pull works directly at the top');
  await screenshot('short-loaded');
  await swipe(tree, 240);
  assert.equal(requests(await nodes()), 1, 'No requests after the history is exhausted');
  console.log('PASS: top-edge pull and history exhaustion');

  await tap('history');
  tree = await nodes();
  assert.equal(requests(tree), 0, 'Opening a long chat stays at its latest message');
  let lastVisible = tree;
  for (let step = 0; step < 35 && requests(tree) === 0; step++) {
    lastVisible = tree;
    await swipe(tree, 480);
    tree = await nodes();
  }
  assert.equal(requests(tree), 1, 'Reading toward the top automatically fetches older history');
  assert.ok(!lastVisible.some(node => node.text === '加载更早的消息'),
    'Prefetch starts before the top loading control enters the viewport');
  assert.ok(tree.some(node => /^历史消息 \d+$/.test(node.text)), 'Existing messages remain visible after prepending');
  await screenshot('history-prefetched');
  await tap('collapsed');
  tree = await nodes();
  assert.equal(requests(tree), 0);
  await swipe(tree, 240);
  for (let attempt = 0; attempt < 12 && requests(tree) < 3; attempt++) tree = await nodes();
  assert.equal(requests(tree), 3, 'Collapsed pages continue without another gesture until history is exhausted');
  assert.ok(!tree.some(node => /已加载 \d+ 条历史记录/.test(node.text)), 'No completion notice interrupts reading');
  await screenshot('collapsed-history-loaded');
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true,
    cases: ['top-edge pull', 'history exhaustion', 'automatic prefetch', 'existing messages remain visible',
      'collapsed history continues', 'no completion notice'] }, null, 2));
  console.log('PASS: automatic history prefetch before reaching the top');
} finally {
  await adb('shell', 'am', 'force-stop', applicationId);
  if (focus && !focus.startsWith(applicationId)) await adb('shell', 'am', 'start', '-W', '-n', focus);
}
