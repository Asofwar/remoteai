import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { launchExtensionTest } from './lib/chrome-extension-test.mjs';

const source = path.resolve('apps/desktop/src-tauri/resources/chrome-extension');
const executable = process.env.CSW_CHROME_TEST_BROWSER ?? chromium.executablePath();
const extensionId = (await fs.readFile(path.join(source, 'extension-id.txt'), 'utf8')).trim();
const root = path.resolve('.codex-tmp', `chrome-background-${Date.now()}`);
const extension = path.join(root, 'extension');
const profile = path.join(root, 'profile');
await fs.mkdir(profile, { recursive: true });
await fs.cp(source, extension, { recursive: true });
await fs.writeFile(path.join(extension, 'background.js'), `
import { execute } from './operations.js';
import { initializePermissions } from './permissions.js';
import { stopDebugging } from './driver.js';
import { debuggerDetached } from './debugger-connections.js';
globalThis.connectionCalls = [];
for (const method of ['attach', 'detach']) {
  const original = chrome.debugger[method].bind(chrome.debugger);
  chrome.debugger[method] = (...args) => { connectionCalls.push({method,target:args[0]}); return original(...args); };
}
chrome.debugger.onDetach.addListener(target => { void debuggerDetached(target); });
globalThis.stop = stopDebugging;
const ready = initializePermissions();
globalThis.run = async (operation, args) => { await ready; return execute({clientId:'fixture'}, {operation,args}); };
globalThis.read = async (tabId) => (await chrome.scripting.executeScript({target:{tabId,allFrames:true},world:'MAIN',
  func:()=>({state:JSON.parse(document.querySelector('#state').textContent),
    checked:document.querySelector('#check').checked,
    url:location.href,visibility:document.visibilityState})})).map(item=>item.result);
chrome.runtime.onInstalled.addListener(()=>{});
`);
const content = await fs.readFile('scripts/fixtures/chrome-plugin-background.html');
const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(content);
}).listen(0, '127.0.0.1');
await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;

function findReference(snapshot, role, name) {
  const line = snapshot.text.split('\n').find(line => line.includes(`${role} "${name}"`));
  assert.ok(line, `Missing ${role}: ${name}`);
  return line.match(/^\[([^\]]+)\]/)[1];
}

async function checkConnectionAndStop(tabId) {
  const { evaluate } = browser;
  await delay(500);
  assert.deepEqual(await evaluate(`connectionCalls.filter(call=>call.target.tabId===${tabId})`),
    [{ method: 'attach', target: { tabId } }]);
  const failed = await evaluate(`run('click',{tabId:${tabId},ref:'expired'}).then(()=>false,()=>true)`);
  assert.equal(failed, true);
  await evaluate(`run('snapshot',{tabId:${tabId}})`);
  assert.deepEqual(await evaluate(`connectionCalls.filter(call=>call.target.tabId===${tabId})`),
    [{ method: 'attach', target: { tabId } }]);
  await evaluate('stop()');
  assert.equal(await evaluate(`chrome.debugger.getTargets().then(targets=>
    targets.find(target=>target.tabId===${tabId})?.attached)`), false);
}

async function checkTaskCompletion() {
  const { evaluate } = browser;
  const open = () => evaluate(`run('open',{url:${JSON.stringify(url)}})`);
  const temporary = await open();
  const kept = await open();
  const user = await evaluate(`chrome.tabs.create({url:${JSON.stringify(url)},active:false})`);
  await evaluate(`chrome.tabs.group({tabIds:[${user.id}],groupId:${temporary.groupId}})`);
  assert.equal(await evaluate(`chrome.tabGroups.get(${temporary.groupId}).then(group=>group.title)`), 'Remote AI');
  const tabIds = [temporary.tabId, kept.tabId, user.id];
  for (const tabId of tabIds) await evaluate(`run('snapshot',{tabId:${tabId}})`);
  const result = await evaluate(`run('finish',${JSON.stringify({ tabIds, keepTabIds: [kept.tabId] })})`);
  assert.deepEqual(result.closedTabIds, [temporary.tabId]);
  assert.deepEqual(result.keptTabIds, [kept.tabId, user.id]);
  assert.deepEqual(result.failedTabIds, []);
  for (const tabId of tabIds) {
    assert.ok(!await evaluate(`chrome.debugger.getTargets().then(items=>items.find(t=>t.tabId===${tabId})?.attached)`));
  }
  await evaluate(`chrome.tabs.remove([${kept.tabId},${user.id}])`);
  const first = await open();
  const second = await open();
  const finished = await evaluate(`run('finish',{tabIds:[${first.tabId},${second.tabId}]})`);
  assert.deepEqual(finished.closedTabIds, [first.tabId, second.tabId]);
  assert.deepEqual(await evaluate(`chrome.tabGroups.query({})`), []);
  assert.deepEqual(await evaluate(`chrome.storage.session.get('browserWorkTabs').then(s=>s.browserWorkTabs)`), []);
  console.log('Passed task completion: temporary tabs and empty groups closed; kept and user tabs preserved.');
}

async function checkTab({ window, active }) {
  const { evaluate } = browser;
  const tab = await evaluate(`chrome.tabs.create(${JSON.stringify({ url, active, windowId: window.id })})`);
  await delay(300);
  await evaluate(`chrome.windows.update(${window.id},{state:'minimized'})`);
  const beforeWindow = await evaluate(`chrome.windows.get(${window.id})`);
  const beforeActive = await evaluate(`chrome.tabs.query({active:true,windowId:${window.id}})`);
  const beforeVisibility = (await evaluate(`read(${tab.id})`))[0].visibility;
  const run = async (operation, args) => {
    const result = await evaluate(`run(${JSON.stringify(operation)},${JSON.stringify({tabId:tab.id,...args})})`);
    assert.equal(await evaluate(`chrome.debugger.getTargets().then(targets=>
      targets.find(target=>target.tabId===${tab.id})?.attached)`), true);
    return result;
  };
  const action = async (operation, { role, name, frameId, ...args }) => {
    const snapshot = await run('snapshot', { ...(frameId ? { frameId } : {}) });
    return run(operation, { ref: findReference(snapshot, role, name), ...args });
  };
  for (const name of ['Plain click', 'Animated click', 'Offscreen click']) {
    await action('click', { role: 'button', name });
  }
  await action('fill', { role: 'textbox', name: 'Test input', text: '后台输入' });
  await action('check', { role: 'checkbox', name: 'Test checkbox', checked: true });
  let [main] = await evaluate(`read(${tab.id})`);
  assert.deepEqual(main.state, { plain: 1, animated: 1, offscreen: 1, input: '后台输入', trusted: true });
  assert.equal(main.checked, true);
  // Scroll the parent back before operating its embedded documents.
  await action('click', { role: 'button', name: 'Plain click' });
  const { frames } = await run('frames', {});
  for (const frame of frames.filter(frame => frame.url.includes('?frame'))) {
    await action('click', { role: 'button', name: 'Plain click', frameId: frame.frameId });
    await action('fill', { role: 'textbox', name: 'Test input', text: '框架输入', frameId: frame.frameId });
  }
  const children = (await evaluate(`read(${tab.id})`)).filter(frame => frame.url.includes('?frame'));
  assert.equal(children.length, 2);
  for (const child of children) {
    assert.equal(child.state.plain, 1);
    assert.equal(child.state.input, '框架输入');
    assert.equal(child.state.trusted, true);
  }
  const afterWindow = await evaluate(`chrome.windows.get(${window.id})`);
  assert.equal(afterWindow.focused, beforeWindow.focused);
  assert.equal(afterWindow.state, beforeWindow.state);
  assert.equal((await evaluate(`chrome.tabs.query({active:true,windowId:${window.id}})`))[0].id, beforeActive[0].id);
  assert.equal((await evaluate(`read(${tab.id})`))[0].visibility, beforeVisibility);
  await checkConnectionAndStop(tab.id);
  await evaluate(`chrome.tabs.remove(${tab.id})`);
  console.log(`Passed ${active ? 'selected' : 'unselected'} tab: one connection across input and frames;`
    + ' stop releases it; window and visibility unchanged.');
}

try {
  browser = await launchExtensionTest({ executable, extension, profile, extensionId });
  const window = await browser.evaluate('chrome.windows.create({url:"about:blank",focused:false,state:"minimized"})');
  for (const active of [false, true]) await checkTab({ window, active });
  await checkTaskCompletion();
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
