import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { launchExtensionTest } from './lib/chrome-extension-test.mjs';

const source = path.resolve('apps/desktop/src-tauri/resources/chrome-extension');
const root = path.resolve('.codex-tmp', `chrome-pointer-${Date.now()}`);
const extension = path.join(root, 'extension');
const profile = path.join(root, 'profile');
await fs.mkdir(profile, { recursive: true });
await fs.cp(source, extension, { recursive: true });
await fs.writeFile(path.join(extension, 'background.js'), `
import { execute } from './operations.js';
import { initializePermissions, setPaused } from './permissions.js';
import { stopDebugging } from './driver.js';
const ready = initializePermissions();
globalThis.run = async (operation, args) => { await ready; return execute({clientId:'fixture'}, {operation,args}); };
globalThis.pause = async () => { await setPaused(true); await stopDebugging(); };
const send = chrome.debugger.sendCommand.bind(chrome.debugger);
chrome.debugger.sendCommand = async (target, method, params) => {
  const result = await send(target, method, params);
  if (method === 'Runtime.callFunctionOn' && params.arguments?.[0]?.value?.phase === 'press' && !globalThis.pressShot) {
    // Hold a real rendered animation frame for visual review; ordinary input tests still run unchanged.
    const animation = method => send(target, 'Runtime.callFunctionOn', {
      executionContextId:params.executionContextId,
      functionDeclaration:method === 'pause'
        ? 'function(){const a=globalThis.__remoteAIControlPointer.pulse;a.pause();a.currentTime=120;}'
        : 'function(){globalThis.__remoteAIControlPointer.pulse.play();}',
    });
    await animation('pause');
    globalThis.pressShot = (await send(target, 'Page.captureScreenshot', {format:'png'})).data;
    await animation('play');
  }
  return result;
};
globalThis.read = tabId => chrome.scripting.executeScript({target:{tabId,allFrames:true},world:'MAIN',func:() => {
  const host = document.querySelector('[data-remote-ai-pointer]');
  const {x,y} = host?.getBoundingClientRect() ?? {};
  const target = document.elementFromPoint((x ?? 0)+2,(y ?? 0)+1);
  return {url:location.href,state:window.fixtureState,scrollY,pointer:host ? {x,y,
    opacity:host.style.opacity,hit:target?.id,hidden:host.getAttribute('aria-hidden')} : null};
}}).then(items=>items.map(item=>item.result));
chrome.runtime.onInstalled.addListener(()=>{});
`);
const content = `<!doctype html><meta charset="utf-8"><title>Pointer preview</title>
<style>body{font:16px system-ui;background:#f6f8fa;color:#171a20;padding:32px;margin:0}
main{background:white;border:1px solid #e3e7ed;border-radius:14px;padding:28px}
h1{font-size:24px;margin:0 0 12px}p{color:#67717e}button{padding:14px 30px;margin:12px 24px 12px 0;
border:1px solid #ccd3dc;border-radius:8px;background:white;color:#171a20;font-size:16px}
button:first-of-type{background:#157dfb;border-color:#157dfb;color:white}
iframe{width:44%;height:220px;margin:18px 1%;border:1px solid #d4dbe3;border-radius:8px}</style>
<main><h1>鼠标操作预览</h1><p>平滑移动 · 点击反馈 · 拖拽操作</p>
<button id="first">查看订单</button><button id="second">刷新列表</button>
<button id="from">拖拽起点</button><button id="to">拖拽终点</button></main><section></section>
<div style="height:900px"></div>
<script>
window.fixtureState={clicks:0,trusted:false,drops:0};let dragging=false;
for(const button of document.querySelectorAll('button')) button.onclick=e=>{
  fixtureState.clicks++;fixtureState.trusted=e.isTrusted;fixtureState.last=button.id;};
document.querySelector('#from').onmousedown=()=>dragging=true;
document.querySelector('#to').onmouseup=()=>{if(dragging)fixtureState.drops++;dragging=false;};
if(!location.search)for(const host of [location.hostname,'localhost']){
  const frame=document.createElement('iframe');const url=new URL(location.href);
  url.hostname=host;url.search='?frame';frame.src=url;document.querySelector('section').append(frame);}
</script>`;
const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(content);
}).listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
const run = (operation, args) => browser.evaluate(`run(${JSON.stringify(operation)},${JSON.stringify(args)})`);
const read = tabId => browser.evaluate(`read(${tabId})`);
function reference(snapshot, name) {
  const line = snapshot.text.split('\n').find(line => line.includes(`button "${name}"`));
  assert.ok(line, `Missing ${name}`);
  return line.match(/^\[([^\]]+)\]/)[1];
}

async function clickAndCheck(tabId, frameId) {
  const page = await run('snapshot', { tabId, ...(frameId ? { frameId } : {}) });
  await run('click', { tabId, ref: reference(page, '查看订单') });
  const frames = await read(tabId);
  const visible = frames.filter(frame => frame.pointer && Number(frame.pointer.opacity) > 0);
  assert.equal(visible.length, 1, `one visible cursor when moving between frame sessions: ${JSON.stringify(frames)}`);
  assert.equal(visible[0].pointer.hidden, 'true');
  assert.ok(frames.some(frame => frame.state.trusted && frame.state.last === 'first'));
  return frames;
}

try {
  browser = await launchExtensionTest({ executable: process.env.CSW_CHROME_TEST_BROWSER ?? chromium.executablePath(),
    extension, profile, extensionId: (await fs.readFile(path.join(source, 'extension-id.txt'), 'utf8')).trim() });
  await browser.evaluate('chrome.windows.create({url:"about:blank",focused:false,state:"minimized"})');
  const tab = await run('open', { url: `http://127.0.0.1:${server.address().port}/` });
  const tabId = tab.tabId;
  await run('wait', { tabId, text: '鼠标操作预览' });
  const first = await clickAndCheck(tabId);
  assert.equal(first.find(frame => frame.pointer).pointer.hit, 'first', 'cursor does not intercept clicks');
  const screenshot = await run('screenshot', { tabId });
  await fs.writeFile(path.join(root, 'pointer-preview.jpg'), Buffer.from(screenshot.image.data, 'base64'));
  await fs.writeFile(path.join(root, 'pointer-click.png'), Buffer.from(await browser.evaluate('pressShot'), 'base64'));
  const { frames } = await run('frames', { tabId });
  for (const frame of frames.filter(frame => frame.url.includes('?frame'))) {
    const after = await clickAndCheck(tabId, frame.frameId);
    assert.equal(after.find(item => item.url === frame.url).state.clicks, 1);
  }
  const page = await run('snapshot', { tabId });
  await run('drag', { tabId, fromRef: reference(page, '拖拽起点'), toRef: reference(page, '拖拽终点') });
  assert.equal((await read(tabId)).find(frame => !frame.url.includes('?frame')).state.drops, 1);
  await run('scroll', { tabId, x: 10, y: 100, deltaY: 180 });
  assert.ok((await read(tabId)).find(frame => !frame.url.includes('?frame')).scrollY > 0);
  const finished = await run('finish', { tabIds: [tabId], keepTabIds: [tabId] });
  assert.deepEqual(finished.failedTabIds, []);
  assert.ok((await read(tabId)).every(frame => !frame.pointer), 'finish removes pointers from every used frame');
  await clickAndCheck(tabId);
  await browser.evaluate('pause()');
  assert.ok((await read(tabId)).every(frame => !frame.pointer), 'pause removes pointers');
  console.log('Passed pointer positioning, trusted input, frames, drag, scroll, task completion and pause.');
  console.log(`Preview: ${path.join(root, 'pointer-click.png')}`);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
