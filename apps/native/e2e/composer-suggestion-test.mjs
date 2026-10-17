import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, '.codex-tmp/suggestion-native');
const samples = JSON.parse(await readFile(path.join(root, 'shared/chat/promptSuggestionFixture.json'), 'utf8'));
const serial = process.env.ANDROID_SERIAL;
assert.ok(serial, 'Set ANDROID_SERIAL to the test device');
const applicationId = 'com.codexswitch.mobile.suggestiontest';
const adb = async (...args) => (await exec('adb', ['-s', serial, ...args],
  { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })).stdout;
const decode = text => text.replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number(value)))
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const pause = () => new Promise(resolve => setTimeout(resolve, 400));
const matches = (node, label) => node.text === label || node['content-desc'] === label;
const bounds = node => [...node.bounds.matchAll(/\d+/g)].map(value => Number(value[0]));

async function nodes() {
  await adb('shell', 'uiautomator', 'dump', '/sdcard/suggestion-layout.xml');
  const xml = await adb('shell', 'cat', '/sdcard/suggestion-layout.xml');
  return [...xml.matchAll(/<node\b([^>]*)>/g)].map(match => Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(value => [value[1], decode(value[2])])));
}
async function find(label) {
  const deadline = Date.now() + 15_000;
  do {
    const target = (await nodes()).find(node => matches(node, label));
    if (target) return target;
    await pause();
  } while (Date.now() < deadline);
  throw new Error(`Control not visible: ${label}`);
}
async function tap(label) {
  const [left, top, right, bottom] = bounds(await find(label));
  await adb('shell', 'input', 'tap', String((left + right) >> 1), String((top + bottom) >> 1));
}
async function verify(name, text) {
  await find('填入建议');
  const tree = await nodes();
  const button = bounds(tree.find(node => matches(node, '填入建议')));
  const preview = bounds(tree.find(node => node.text === text && node['content-desc'] !== '完整预测'));
  const hint = bounds(tree.find(node => node.text === '填入'));
  assert.ok(preview[0] >= button[0] && preview[2] <= hint[0], 'Text and hint have separate columns');
  assert.ok(preview[1] >= button[1] && preview[3] <= button[3], 'The preview height fits inside the button');
  await adb('shell', 'screencap', '-p', '/sdcard/suggestion-result.png');
  await adb('pull', '/sdcard/suggestion-result.png', path.join(output, `${name}.png`));
  await tap('填入建议');
  assert.equal((await find('聊天消息')).text, text, 'Acceptance preserves the complete preview');
  await tap('下一条预测');
  return { button, preview, hint };
}

await mkdir(output, { recursive: true });
await adb('install', '-r', path.join(root,
  'apps/native/android/app/build/outputs/apk/release/composer-suggestion-fixture.apk'));
await adb('shell', 'am', 'force-stop', applicationId);
await adb('shell', 'am', 'start', '-W', '-n', `${applicationId}/com.codexswitch.mobile.MainActivity`);
try {
  const results = {};
  for (const width of ['normal', 'narrow']) {
    if (width === 'narrow') await tap('切换窄屏');
    for (const [name, text] of Object.entries(samples)) {
      results[`${width}-${name}`] = await verify(`${width}-${name}`, text);
    }
    const short = results[`${width}-reported`].preview;
    const wrapped = results[`${width}-wrapped`].preview;
    assert.ok(wrapped[3] - wrapped[1] > short[3] - short[1], 'Long previews grow to show wrapped lines');
  }
  assert.ok(results['narrow-reported'].button[2] - results['narrow-reported'].button[0]
    < results['normal-reported'].button[2] - results['normal-reported'].button[0]);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, results }, null, 2));
  console.log('PASS: complete native suggestions, wrapping, separate hint, and draft acceptance at both widths');
} finally { await adb('shell', 'am', 'force-stop', applicationId); }
