import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adb, apk, output, waitFor, waitText, tap, screenshot, nodes } from './android-chat-driver.mjs';
import { prepareHierarchy } from './android-hierarchy.mjs';
import { recordStreamingPosition } from './android-stream-position-video.mjs';

const PACKAGE = 'com.codexswitch.mobile.scrolltest';
const TITLE = '已编辑 55 个文件';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const visible = (node) => node.rect[3] > node.rect[1] && node.rect[2] > node.rect[0];
const titleNode = async () => (await nodes()).find((node) => node.text === TITLE && visible(node));
const report = { passed: false, cases: [] };

async function keyboard() {
  const before = await titleNode();
  assert.ok(before);
  await tap('Keyboard test');
  await pause(800);
  assert.ok(await titleNode(), 'Latest file summary stays visible above the keyboard');
  await screenshot('stream-keyboard');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await pause(800);
  assert.deepEqual((await titleNode())?.rect, before.rect, 'Closing the keyboard restores the bottom position');
  report.cases.push('keyboard at latest messages');
}

async function readOlderWhileStreaming() {
  await tap('Start stream');
  await pause(1200);
  await adb('shell', 'input', 'swipe', '540', '650', '540', '1750', '550');
  await pause(600);
  const anchors = (await nodes()).filter((node) => node.text?.includes('echo anchor') && visible(node));
  assert.ok(anchors.length >= 3, 'Earlier command rows are visible while streaming');
  const before = await nodes();
  await pause(2500);
  const after = await nodes();
  assert.notEqual(before.find((node) => node.text?.startsWith('Start '))?.text,
    after.find((node) => node.text?.startsWith('Start '))?.text, 'The reply continues to stream');
  for (const anchor of anchors) {
    assert.deepEqual(after.find((node) => node.text === anchor.text)?.rect, anchor.rect,
      'New text does not pull a reader away from earlier messages');
  }
  await tap('Keyboard test');
  await pause(600);
  const readingWithKeyboard = await nodes();
  assert.deepEqual(readingWithKeyboard.find((node) => node.text === anchors[0].text)?.rect, anchors[0].rect,
    'Opening the keyboard preserves the earlier message at the top');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await screenshot('stream-reading-older');
  await tap('回到底部');
  await waitFor(async () => Boolean(await titleNode()), 'explicit return to latest messages');
  report.cases.push('reading position during streaming and explicit return');
}

async function shortHistory() {
  await tap('short');
  await waitText('已运行 echo anchor 0');
  const before = (await nodes()).find((node) => node.text === '已运行 echo anchor 0');
  await tap('加载更早的消息');
  await waitFor(async () => !(await nodes()).some((node) => node.text === '正在加载聊天记录…'), 'older page finished');
  const after = (await nodes()).find((node) => node.text === before.text);
  assert.ok(after && visible(after), 'Loading history keeps the original message visible');
  assert.ok(Math.abs(after.rect[1] - before.rect[1]) <= 2, 'A short history keeps its reading position');
  await screenshot('stream-short-pagination');
  report.cases.push('pagination from a short history');
}

async function plainReply() {
  await tap('plain');
  await tap('Start stream');
  await waitText('Start 160');
  const current = await nodes();
  const reply = current.find((node) => node.text?.startsWith('正在检查富文本') && visible(node));
  const viewport = current.find((node) => node.scrollable === 'true' && visible(node));
  assert.ok(reply && viewport && reply.rect[3] < viewport.rect[3] - 20,
    'The end of a plain streamed reply remains visible with room for the list padding');
  await screenshot('stream-plain-reply');
  report.cases.push('plain reply without a file card');
}

try {
  await mkdir(output, { recursive: true });
  assert.match(await adb('shell', 'wm', 'size'), /1080x2424/, 'Video coordinates require the Pixel 9 emulator');
  await prepareHierarchy({ adb, output });
  await adb('install', '-r', apk);
  await adb('shell', 'am', 'force-stop', PACKAGE);
  await adb('shell', 'am', 'start', '-n', `${PACKAGE}/com.codexswitch.mobile.MainActivity`);
  await waitText(TITLE);
  await pause(1000);
  if (!process.argv.includes('--pagination-only')) {
    const title = await titleNode();
    report.video = await recordStreamingPosition({ name: 'stream-file-card', title: title.rect,
      start: () => tap('Start stream') });
    await keyboard();
    await readOlderWhileStreaming();
    await plainReply();
  }
  await shortHistory();
  report.passed = true;
  console.log('PASS: frame-stable streaming, keyboard resizing, reading older messages and pagination');
} catch (error) {
  report.error = String(error);
  await screenshot('stream-scroll-failed');
  throw error;
} finally {
  await writeFile(path.join(output, 'stream-scroll-report.json'), JSON.stringify(report, null, 2));
}
