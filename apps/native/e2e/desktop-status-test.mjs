import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const baseline = process.argv.includes('--baseline');
const output = path.join(root, '.codex-tmp/desktop-status', baseline ? 'baseline' : 'fixed');
const serial = process.env.ANDROID_SERIAL;
assert.ok(serial, 'Set ANDROID_SERIAL to the physical test device');
const applicationId = 'com.codexswitch.mobile.desktopstatustest';
const adb = async (...args) => (await exec('adb', ['-s', serial, ...args],
  { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })).stdout.trim();
const results = [];

async function nodes() {
  await adb('shell', 'uiautomator', 'dump', '/sdcard/desktop-status-layout.xml');
  const xml = await adb('shell', 'cat', '/sdcard/desktop-status-layout.xml');
  return [...xml.matchAll(/<node\b([^>]*)>/g)].map(match => Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute => [attribute[1], attribute[2]])));
}

function bounds(node) {
  assert.ok(node, 'Expected native view is present');
  const [left, top, right, bottom] = [...node.bounds.matchAll(/\d+/g)].map(value => Number(value[0]));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

async function tap(label) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const tree = await nodes();
    const control = tree.find(node => node.text === label || node['content-desc'] === label);
    if (control && bounds(control).height > 0) {
      const box = bounds(control);
      await adb('shell', 'input', 'tap', String(Math.round((box.left + box.right) / 2)),
        String(Math.round((box.top + box.bottom) / 2)));
      await delay(700);
      return;
    }
    const scrollable = tree.find(node => node.scrollable === 'true');
    if (!scrollable) { await delay(500); continue; }
    const box = bounds(scrollable);
    const horizontal = box.width > box.height;
    const coordinate = (fraction, start, length) => String(Math.round(start + fraction * length));
    await adb('shell', 'input', 'swipe', coordinate(horizontal ? 0.8 : 0.5, box.left, box.width),
      coordinate(horizontal ? 0.5 : 0.8, box.top, box.height),
      coordinate(horizontal ? 0.2 : 0.5, box.left, box.width),
      coordinate(horizontal ? 0.5 : 0.2, box.top, box.height), '350');
  }
  assert.fail(`Control not found: ${label}`);
}

async function verify({ scenario, orientation, fontScale, density, minimumHeight }) {
  const name = `${scenario}-${orientation}-${fontScale}`;
  const tree = await nodes();
  await adb('shell', 'screencap', '-p', '/sdcard/desktop-status-result.png');
  await adb('pull', '/sdcard/desktop-status-result.png', path.join(output, `${name}.png`));
  const message = tree.find(node => scenario === 'connecting'
    ? node.text === '正在连接桌面…' : node.text.startsWith('请在 Mac 上允许屏幕录制'));
  const retry = tree.find(node => node.text === (scenario === 'connecting' ? '重新连接' : '检查授权'));
  const messageBox = bounds(message);
  const retryBox = bounds(retry);
  results.push({ name, message: messageBox, retry: retryBox, minimumHeight });
  if (baseline) return;
  assert.ok(messageBox.height >= minimumHeight, `${name}: connection text has line and font padding`);
  assert.ok(retryBox.height >= minimumHeight, `${name}: retry text has line and font padding`);
  assert.ok(messageBox.width <= 400 * density + 1, `${name}: message stays compact`);
  assert.ok(messageBox.right <= retryBox.left, `${name}: text and action do not overlap`);
  assert.ok(messageBox.top >= 0, `${name}: message stays on screen`);
  const screenRight = Math.max(...tree.map(node => bounds(node).right));
  const screenBottom = Math.max(...tree.map(node => bounds(node).bottom));
  assert.equal(screenRight > screenBottom, orientation === 'landscape', `${name}: expected orientation`);
  assert.ok(messageBox.bottom < screenBottom && retryBox.right <= screenRight, `${name}: content fits`);
}

async function runScenarios(fontScale, density) {
  await adb('shell', 'settings', 'put', 'system', 'font_scale', String(fontScale));
  await adb('shell', 'am', 'force-stop', applicationId);
  await adb('shell', 'am', 'start', '-W', '-n', `${applicationId}/com.codexswitch.mobile.MainActivity`);
  const reference = (await nodes()).find(node => node['resource-id'] === 'status-line-reference');
  const minimumHeight = bounds(reference).height - 1;
  for (const scenario of ['connecting', 'permission']) {
    await tap(scenario === 'connecting' ? 'Connecting status' : 'Permission status');
    await verify({ scenario, orientation: 'landscape', fontScale, density, minimumHeight });
    if (scenario === 'connecting') {
      await tap('重新连接');
      await verify({ scenario, orientation: 'landscape', fontScale, density, minimumHeight });
    }
    await tap('旋转');
    await verify({ scenario, orientation: 'portrait', fontScale, density, minimumHeight });
    await tap('关闭');
  }
}

await mkdir(output, { recursive: true });
const originalScale = await adb('shell', 'settings', 'get', 'system', 'font_scale');
const densityOutput = await adb('shell', 'wm', 'density');
const density = Number([...densityOutput.matchAll(/density:\s*(\d+)/g)].at(-1)[1]) / 160;
const model = await adb('shell', 'getprop', 'ro.product.model');
assert.notEqual(await adb('shell', 'getprop', 'ro.kernel.qemu'), '1', 'Use a physical Android device');
try {
  await adb('install', '-r', path.join(root,
    'apps/native/android/app/build/outputs/apk/release/desktop-status-fixture.apk'));
  for (const fontScale of [1, 1.3]) await runScenarios(fontScale, density);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ model, baseline, results }, null, 2));
  console.log(`${baseline ? 'BASELINE' : 'PASS'}: ${model}, ${results.length} native status checks`);
} finally {
  if (originalScale === 'null') await adb('shell', 'settings', 'delete', 'system', 'font_scale');
  else await adb('shell', 'settings', 'put', 'system', 'font_scale', originalScale);
  await adb('shell', 'am', 'force-stop', applicationId);
  await adb('shell', 'am', 'start', '-W', '-n', 'com.codexswitch.mobile/com.codexswitch.mobile.MainActivity');
}
