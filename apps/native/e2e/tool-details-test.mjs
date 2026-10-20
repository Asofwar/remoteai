import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, '.codex-tmp/tool-details');
const serial = process.env.ANDROID_SERIAL;
assert.ok(serial, 'Set ANDROID_SERIAL to the connected phone');
const applicationId = 'com.codexswitch.mobile.tooldetailstest';
const reported = JSON.parse(await readFile(path.join(root, 'shared/chat/toolDetailsFixture.json'), 'utf8'));
const adb = async (...args) => (await exec('adb', ['-s', serial, ...args],
  { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })).stdout;
const decode = text => text.replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number(value)))
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const bounds = node => [...node.bounds.matchAll(/\d+/g)].map(value => Number(value[0]));
const matches = (node, label) => node.text?.replace(/\uFFFC/g, '') === label || node['content-desc'] === label;

async function nodes() {
  await adb('shell', 'uiautomator', 'dump', '/sdcard/tool-details-layout.xml');
  const xml = await adb('shell', 'cat', '/sdcard/tool-details-layout.xml');
  await writeFile(path.join(output, 'latest.xml'), xml);
  return [...xml.matchAll(/<node\b([^>]*)>/g)].map(match => Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(value => [value[1], decode(value[2])])));
}

async function find(label) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const target = (await nodes()).find(node => matches(node, label));
    if (target) return target;
  }
  throw new Error(`Control not visible: ${label}`);
}

async function tap(label) {
  const [left, top, right, bottom] = bounds(await find(label));
  await adb('shell', 'input', 'tap', String((left + right) >> 1), String((top + bottom) >> 1));
}

async function screenshot(name) {
  await adb('shell', 'screencap', '-p', '/sdcard/tool-details-result.png');
  await adb('pull', '/sdcard/tool-details-result.png', path.join(output, `${name}.png`));
}

async function verifyCompact(name) {
  const tree = await nodes();
  const paragraphs = reported.result.content.map(part =>
    tree.find(node => node.text.startsWith(part.text)));
  assert.ok(paragraphs.every(Boolean), 'Both reported output paragraphs remain complete');
  const [first, second] = paragraphs.map(bounds);
  const copies = tree.filter(node => node['content-desc'] === '复制完整内容');
  assert.equal(copies.length, 2, 'Each output retains its copy action');
  assert.ok(copies.every(node => !node.text), 'Copy actions do not add visible label rows');
  assert.ok(second[1] - first[3] < (first[3] - first[1]) * 2, 'No standalone toolbar gap between paragraphs');
  await screenshot(name);
  return { first, second, copies: copies.map(bounds) };
}

async function verifyNested() {
  await tap('查看输入');
  await find('复制输入');
  await screenshot('input');
  await tap('关闭输入');
  await tap('查看结构化结果');
  await find('复制结构化结果');
  await screenshot('structured');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await find('关闭使用工具');
}

async function scrollTo(label) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const tree = await nodes();
    if (tree.some(node => matches(node, label))) return;
    const scroll = tree.find(node => node.scrollable === 'true');
    assert.ok(scroll, 'Long output has a scrollable viewport');
    const [left, top, right, bottom] = bounds(scroll);
    const x = String((left + right) >> 1);
    await adb('shell', 'input', 'swipe', x, String(bottom - 50), x, String(top + 50), '100');
  }
  throw new Error(`Unable to scroll to ${label}`);
}

await mkdir(output, { recursive: true });
await adb('install', '-r', path.join(root,
  'apps/native/android/app/build/outputs/apk/release/tool-details-fixture.apk'));
await adb('shell', 'am', 'force-stop', applicationId);
await adb('shell', 'am', 'start', '-W', '-n', `${applicationId}/com.codexswitch.mobile.MainActivity`);
await find('关闭使用工具');
const light = await verifyCompact('fixed-light');
await verifyNested();
await tap('复制完整内容');
await find('已复制');
await tap('关闭使用工具');
await tap('检查复制内容');
await find(reported.result.content[0].text);
await tap('切换主题');
await tap('reported');
const dark = await verifyCompact('fixed-dark');
await tap('返回上一层');
await tap('literal');
await find('<div>literal output</div>\n**keep these characters**');
await screenshot('literal');
await tap('关闭使用工具');
await tap('long');
await scrollTo('下一段');
await tap('下一段');
await scrollTo('复制完整内容');
assert.ok((await nodes()).some(node => node.text.includes('OUTPUT_END')), 'The final page remains readable');
await screenshot('last-page');
await tap('复制完整内容');
await find('已复制');
await tap('关闭使用工具');
await tap('检查复制内容');
const copied = (await nodes()).find(node => node['resource-id'] === 'copied-output')?.text;
assert.ok(copied?.length > 8_000 && copied.endsWith('OUTPUT_END'), 'Paging still copies the complete output');
await tap('切换主题');
await tap('reported');
const pid = (await adb('shell', 'pidof', applicationId)).trim();
assert.match(pid, /^\d+$/);
const errors = await adb('logcat', '-d', '-t', '1000', `--pid=${pid}`, '-s', 'ReactNativeJS:E', 'AndroidRuntime:E');
assert.doesNotMatch(errors, /FATAL EXCEPTION|TypeError|ReferenceError/);
await writeFile(path.join(output, 'result.json'), JSON.stringify({ serial, light, dark, passed: true,
  cases: ['compact output', 'nested payloads', 'copy', 'dark theme', 'literal text', 'paging full copy'] }, null, 2));
console.log('PASS: real Android tool details, nested sheets, full copy, themes and pagination');
