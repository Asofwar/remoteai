import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, '.codex-tmp/project-browser-android');
const serial = process.env.ANDROID_SERIAL;
assert.ok(serial, 'Set ANDROID_SERIAL to the test device');
const applicationId = 'com.codexswitch.mobile.filebrowsertest';
const adb = async (...args) => (await exec('adb', ['-s', serial, ...args],
  { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })).stdout;
const decode = text => text.replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number(value)))
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const bounds = node => [...node.bounds.matchAll(/\d+/g)].map(value => Number(value[0]));

async function nodes() {
  await adb('shell', 'uiautomator', 'dump', '/sdcard/project-browser-layout.xml');
  const xml = await adb('shell', 'cat', '/sdcard/project-browser-layout.xml');
  await writeFile(path.join(output, 'latest-layout.xml'), xml);
  return [...xml.matchAll(/<node\b([^>]*)>/g)].map(match => Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(value => [value[1], decode(value[2])])))
    .filter(node => node.package === applicationId);
}
async function find(label, kind) {
  const deadline = Date.now() + 15_000;
  do {
    const match = (await nodes()).find(node => {
      const named = node.text === label || node['content-desc'] === label;
      // Android exposes contenteditable text instead of its aria-label in the UIAutomator tree.
      const editor = label === '文件内容' && node.class.endsWith('EditText') && node.text.startsWith('export ');
      return (named || editor) && (!kind || node.class.endsWith(kind));
    });
    if (match) return match;
    await new Promise(resolve => setTimeout(resolve, 300));
  } while (Date.now() < deadline);
  throw new Error(`Control not visible: ${label} ${kind ?? ''}`);
}
async function tap(label, kind) {
  const [left, top, right, bottom] = bounds(await find(label, kind));
  await adb('shell', 'input', 'tap', String((left + right) >> 1), String((top + bottom) >> 1));
}
async function screenshot(name) {
  await adb('shell', 'screencap', '-p', '/sdcard/project-browser-result.png');
  await adb('pull', '/sdcard/project-browser-result.png', path.join(output, `${name}.png`));
}
async function openCode() {
  await tap('src');
  await tap('main.ts');
  await find('文件内容', 'EditText');
}

await mkdir(output, { recursive: true });
const focus = (await adb('shell', 'dumpsys', 'window')).match(/mCurrentFocus=.* u0 ([\w.$]+\/[\w.$]+)/)?.[1];
await adb('install', '-r', path.join(root,
  'apps/native/android/app/build/outputs/apk/release/project-browser-fixture.apk'));
await adb('shell', 'am', 'start', '-W', '-n', `${applicationId}/com.codexswitch.mobile.MainActivity`);
try {
  await find('src');
  await screenshot('tree');
  await openCode();
  await tap('全部折叠');
  await screenshot('folded');
  await tap('全部展开');
  await tap('查找', 'Button');
  await adb('shell', 'input', 'text', 'message');
  await screenshot('search-keyboard');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await tap('关闭', 'Button');
  await tap('文件内容', 'EditText');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END');
  await adb('shell', 'input', 'text', 'native_edit');
  await screenshot('editing-keyboard');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await tap('关闭文件浏览器');
  await find('打开文件浏览');
  await tap('打开文件浏览');
  assert.ok((await find('文件内容', 'EditText')).text.includes('native_edit'), 'Draft survives closing the drawer');
  await tap('关闭文件 main.ts');
  await find('保留文件修改？');
  await screenshot('unsaved');
  await tap('保存并继续');
  await tap('关闭文件浏览器');
  await find('打开文件浏览');
  await tap('打开文件浏览');
  await openCode();
  assert.ok((await find('文件内容', 'EditText')).text.includes('native_edit'), 'Saved content survives reopening');
  await screenshot('saved');
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, serial }, null, 2));
  console.log('PASS: native file tree, fold, search, keyboard, save and unsaved-close guard');
} catch (error) {
  await screenshot('failed');
  throw error;
} finally {
  await adb('shell', 'am', 'force-stop', applicationId);
  await adb('uninstall', applicationId);
  if (focus && !focus.startsWith(applicationId)) await adb('shell', 'am', 'start', '-W', '-n', focus);
}
