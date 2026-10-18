import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { launchExtensionTest } from './lib/chrome-extension-test.mjs';

const source = path.resolve('apps/desktop/src-tauri/resources/chrome-extension');
const executable = process.env.CSW_CHROME_TEST_BROWSER ?? chromium.executablePath();
const extensionId = (await fs.readFile(path.join(source, 'extension-id.txt'), 'utf8')).trim();
const root = path.resolve('.codex-tmp', `chrome-popup-tabs-${Date.now()}`);
const extension = path.join(root, 'extension');
const profile = path.join(root, 'profile');
await fs.mkdir(profile, { recursive: true });
await fs.cp(source, extension, { recursive: true });
await fs.writeFile(path.join(extension, 'background.js'), `
import { execute } from './operations.js';
import { initializePermissions } from './permissions.js';
import { debuggerDetached } from './debugger-connections.js';
import { forgetWorkTab } from './tab-groups.js';
chrome.debugger.onDetach.addListener(target => { void debuggerDetached(target); });
chrome.tabs.onRemoved.addListener(tabId => { void forgetWorkTab(tabId); });
const ready = initializePermissions();
globalThis.run = async (operation, args) => { await ready; return execute({clientId:'fixture'}, {operation,args}); };
chrome.runtime.onInstalled.addListener(()=>{});
`);
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  if (request.url === '/frame') {
    response.end('<a href="/frame-child" target="_blank" rel="noopener">Frame link</a>');
    return;
  }
  response.end(`<!doctype html><title>Popup ownership fixture</title>
    <a href="/child" target="_blank">New tab</a>
    <a href="/noopener" target="_blank" rel="noopener noreferrer">No opener</a>
    <button onclick="window.open('/script')">Script tab</button>
    <button onclick="window.open('/popup','popup','width=500,height=400')">Popup window</button>
    <iframe title="Child frame" src="/frame"></iframe>`);
}).listen(0, '127.0.0.1');
await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;

async function findNewPage(operation) {
  const { evaluate } = browser;
  const before = await evaluate('chrome.tabs.query({}).then(tabs=>tabs.map(tab=>tab.id))');
  await operation();
  const tabs = await evaluate('chrome.tabs.query({})');
  const children = tabs.filter(tab => !before.includes(tab.id));
  assert.equal(children.length, 1, 'Input should create exactly one page');
  return children[0];
}

async function clickAndFindChild(tabId, label, frameId) {
  const { evaluate } = browser;
  const args = { tabId, ...(frameId ? { frameId } : {}) };
  const snapshot = await evaluate(`run('snapshot',${JSON.stringify(args)})`);
  const line = snapshot.text.split('\n').find(line => line.includes(`"${label}"`));
  assert.ok(line, `Missing control: ${label}`);
  const ref = line.match(/^\[([^\]]+)\]/)[1];
  return findNewPage(() => evaluate(`run('click',${JSON.stringify({ tabId, ref })})`));
}

async function checkLinkCleanup() {
  const { evaluate } = browser;
  const parent = await evaluate(`run('open',{url:${JSON.stringify(url)}})`);
  const child = await clickAndFindChild(parent.tabId, 'New tab');
  const result = await evaluate(`run('finish',{tabIds:[${parent.tabId},${child.id}]})`);
  assert.deepEqual(result.closedTabIds, [parent.tabId, child.id]);
  assert.deepEqual(result.keptTabIds, []);
  assert.deepEqual(result.failedTabIds, []);
  assert.deepEqual(await evaluate('chrome.tabGroups.query({})'), []);
  console.log('Passed clicked link cleanup: parent, child and empty group removed.');
}

async function checkKeptAndUserPages() {
  const { evaluate } = browser;
  const parent = await evaluate(`chrome.tabs.create({url:${JSON.stringify(url)},active:false})`);
  const child = await clickAndFindChild(parent.id, 'No opener');
  const grandchild = await clickAndFindChild(child.id, 'Script tab');
  // Opening from the same parent outside an assistant action must not transfer ownership.
  const userChild = await evaluate(`chrome.tabs.create({url:${JSON.stringify(url)},
    openerTabId:${child.id},active:false})`);
  await evaluate(`chrome.tabs.group({tabIds:[${userChild.id}],groupId:${child.groupId}})`);
  const tabIds = [parent.id, child.id, grandchild.id, userChild.id];
  const args = { tabIds, keepTabIds: [child.id] };
  const result = await evaluate(`run('finish',${JSON.stringify(args)})`);
  assert.deepEqual(result.closedTabIds, [grandchild.id]);
  assert.deepEqual(result.keptTabIds, [parent.id, child.id, userChild.id]);
  assert.deepEqual(result.failedTabIds, []);
  const repeated = await evaluate(`run('finish',{tabIds:[${child.id}]})`);
  assert.deepEqual(repeated.closedTabIds, []);
  await evaluate(`chrome.tabs.remove([${parent.id},${child.id},${userChild.id}])`);
  console.log('Passed explicit keep, existing user page, manual child and chained link protection.');
}

async function checkKeyboardFramesAndWindows() {
  const { evaluate } = browser;
  const parent = await evaluate(`run('open',{url:${JSON.stringify(url)}})`);
  await evaluate(`run('snapshot',{tabId:${parent.tabId}})`);
  await evaluate(`run('key',{tabId:${parent.tabId},key:'Tab'})`);
  const keyed = await findNewPage(() => evaluate(`run('key',{tabId:${parent.tabId},key:'Enter'})`));
  const { frames } = await evaluate(`run('frames',{tabId:${parent.tabId}})`);
  const frame = frames.find(frame => frame.url.endsWith('/frame'));
  assert.ok(frame, 'Expected embedded frame');
  const framed = await clickAndFindChild(parent.tabId, 'Frame link', frame.frameId);
  const popup = await clickAndFindChild(parent.tabId, 'Popup window');
  assert.notEqual(popup.windowId, parent.windowId);
  assert.equal(popup.groupId, -1);
  const tabIds = [parent.tabId, keyed.id, framed.id, popup.id];
  const result = await evaluate(`run('finish',${JSON.stringify({ tabIds })})`);
  assert.deepEqual(result.closedTabIds, tabIds);
  assert.deepEqual(result.failedTabIds, []);
  const remaining = await evaluate('chrome.tabs.query({}).then(tabs=>tabs.map(tab=>tab.id))');
  assert.ok(tabIds.every(id => !remaining.includes(id)));
  assert.deepEqual(await evaluate('chrome.tabGroups.query({})'), []);
  console.log('Passed keyboard, iframe and popup-window cleanup.');
}

try {
  browser = await launchExtensionTest({ executable, extension, profile, extensionId });
  await browser.evaluate('chrome.windows.create({url:"about:blank",focused:false,state:"minimized"})');
  await checkLinkCleanup();
  await checkKeptAndUserPages();
  await checkKeyboardFramesAndWindows();
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
