import assert from 'node:assert/strict';
import { adb, apiUrl, prepare, waitText, tap, input, screenshot, serverState, waitFor, nodes, tapNode }
  from './android-chat-driver.mjs';

async function tapVideoLink(label) {
  const node = (await nodes()).find((entry) => entry.text.startsWith(label));
  assert.ok(node, 'video link is visible');
  // Android exposes the whole paragraph bounds; the link occupies only its text glyphs.
  await adb('shell', 'input', 'tap', String(node.rect[0] + 40),
    String(Math.round((node.rect[1] + node.rect[3]) / 2)));
}

await prepare();
await fetch(apiUrl + '/test/sidebar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'video-preview' }) });
await waitText('云端服务器地址');
await input(0, apiUrl);
await input(1, 'mobile-test@example.test');
await input(2, 'local-test');
if (/mInputShown=true/.test(await adb('shell', 'dumpsys', 'input_method'))) {
  await adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
}
await tap('登录并查看');
await waitText('聊天消息');
await tap('打开聊天列表');
await waitText('移动端聊天体验');
await tap('移动端聊天体验');
await waitText('播放测试视频');
await tapVideoLink('播放测试视频');
await waitText('关闭视频');
await waitFor(async () => (await serverState()).operations.some((entry) => entry.operation === 'videoRead'),
  'streamed video reads');
await waitFor(async () => (await nodes()).some((node) => /^(play|播放)$/i.test(node['content-desc'])),
  'video player controls');
await screenshot('video-01-ready');
const play = (await nodes()).find((node) => /^(play|播放)$/i.test(node.text || node['content-desc'] || ''));
if (play) await tapNode(play);
else {
  const video = (await nodes()).find((node) => node.class === 'android.webkit.WebView');
  assert.ok(video, 'in-app video webview');
  const [left, top, right, bottom] = video.rect;
  await adb('shell', 'input', 'tap', String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2)));
}
await waitFor(async () => (await nodes()).some((node) => /^(pause|暂停)$/i.test(node['content-desc'])),
  'video is playing');
await screenshot('video-02-playing');
let seek;
await waitFor(async () => {
  const current = await nodes();
  seek = current.find((node) => node.class === 'android.widget.SeekBar');
  if (seek) return true;
  const player = current.find((node) => node.class === 'android.webkit.WebView');
  if (player) await tapNode(player);
  return false;
}, 'video seek control');
await adb('shell', 'input', 'tap', String(Math.round(seek.rect[0] + (seek.rect[2] - seek.rect[0]) * 0.6)),
  String(Math.round((seek.rect[1] + seek.rect[3]) / 2)));
await new Promise((resolve) => setTimeout(resolve, 1500));
await screenshot('video-02-seek');
await adb('emu', 'sensor', 'set', 'acceleration', '9.8:0:0');
await waitText('旋转视频');
await tap('旋转视频');
await waitFor(async () => /mRotation=1/.test(await adb('shell', 'dumpsys', 'window', 'displays')), 'video landscape');
await screenshot('video-03-landscape');
await tap('关闭视频');
await waitText('聊天消息');
await waitFor(async () => (await serverState()).operations.some((entry) => entry.operation === 'videoClose'),
  'video session released');
const reads = (await serverState()).operations.filter((entry) => entry.operation === 'videoRead');
assert.ok(reads.length > 1);
assert.ok(reads.every((entry) => entry.length <= 256 * 1024));
assert.equal((await serverState()).operations.some((entry) => entry.operation === 'textPreview'), false);
await waitText('播放超限视频');
await tapVideoLink('播放超限视频');
await waitText('视频超过 100 MB');
await screenshot('video-04-size-limit');
assert.equal((await serverState()).operations.filter((entry) => entry.operation === 'videoRead').length, reads.length);
await tap('关闭视频');
await adb('emu', 'sensor', 'set', 'acceleration', '0:9.8:0');
const logs = await adb('logcat', '-d', '-s', 'ReactNativeJS:E', 'AndroidRuntime:E');
assert.doesNotMatch(logs, /FATAL EXCEPTION|TypeError|ReferenceError/);
console.log('PASS native streaming video playback, rotation, close and size limit');
