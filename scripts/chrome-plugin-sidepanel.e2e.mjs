import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const source = path.resolve('apps/desktop/src-tauri/resources/chrome-extension');
const root = path.resolve('.codex-tmp', `chrome-sidepanel-${Date.now()}`);
const extension = path.join(root, 'extension');
const live = process.env.CSW_CHROME_LIVE_CHAT === '1';
const localWeb = process.env.CSW_CHROME_CHAT_TEST_URL;
const manifest = JSON.parse(await fs.readFile(path.join(source, 'manifest.json'), 'utf8'));
assert.equal(manifest.action.default_popup, undefined);
assert.equal(manifest.side_panel.default_path, 'sidepanel.html');
assert.ok(manifest.permissions.includes('sidePanel'));

// The fixture tests frame lifecycle and scroll isolation; live mode smoke-tests the hosted mobile Web UI.
const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{margin:0;background:#f4f7f5;font:16px system-ui}main{height:3000px;padding:16px}</style>
    <main><h1>聊天界面测试</h1><textarea aria-label="草稿"></textarea></main>`);
}).listen(0, '127.0.0.1');
await once(server, 'listening');
const fixtureUrl = `http://127.0.0.1:${server.address().port}`;
const chatUrl = live ? 'https://codex.onepiper.cloud/web/' : localWeb || fixtureUrl + '/';

async function prepare() {
  await fs.cp(source, extension, { recursive: true });
  const background = path.join(extension, 'background.js');
  // Never connect an isolated UI test to the user's installed native host or account.
  await fs.writeFile(background, `chrome.runtime.connectNative = () => ({
    onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, postMessage() {} });\n`
    + await fs.readFile(background, 'utf8'));
  await fs.writeFile(path.join(extension, 'test-open.html'),
    '<button id="open">Open panel</button><button id="close">Close panel</button><script src="test-open.js"></script>');
  await fs.writeFile(path.join(extension, 'test-open.js'), `chrome.windows.getCurrent().then(w => {
    document.querySelector('#open').onclick = () => chrome.sidePanel.open({windowId:w.id});
    document.querySelector('#close').onclick = () => chrome.sidePanel.close({windowId:w.id});
  });`);
  if (live) return;
  const script = path.join(extension, 'sidepanel.js');
  await fs.writeFile(script, (await fs.readFile(script, 'utf8')).replace('https://codex.onepiper.cloud/web/', chatUrl));
  manifest.content_security_policy.extension_pages += ` ${new URL(chatUrl).origin}`;
  await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
}

async function until(read, check = Boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await read();
    if (check(result)) return result;
    await delay(100);
  }
  throw new Error('Timed out waiting for side panel state');
}

// Playwright excludes Chrome side panels from context.pages(); attach their actual CDP targets directly.
async function attach(cdp, targetId) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
  const pending = new Map();
  let sequence = 0;
  cdp.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) })
      .catch(reject);
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  return { send, evaluate };
}

async function targetFor(cdp, suffix, type = 'page') {
  const target = await until(async () => (await cdp.send('Target.getTargets')).targetInfos
    .find(item => item.type === type && item.url.endsWith(suffix)));
  return attach(cdp, target.targetId);
}

async function screenshot(target, name) {
  const { data } = await target.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(root, `${name}.png`), Buffer.from(data, 'base64'));
}

async function verifySettings(panel, worker) {
  await panel.evaluate(`document.querySelector('#settings-toggle').click()`);
  // The test browser may use any UI language; compare with the message Chrome selected for it.
  await until(() => panel.evaluate(`document.querySelector('#settings').contentDocument?.querySelector('#pause')
    ?.textContent === chrome.i18n.getMessage('pauseControl')`));
  await screenshot(panel, 'settings');
  await panel.evaluate(`document.querySelector('#settings').contentDocument.querySelector('#pause').click()`);
  await until(() => worker.evaluate(async () => (await chrome.storage.local.get('paused')).paused));
  await panel.evaluate(`document.querySelector('#settings').contentDocument.querySelector('#name').value = '侧栏测试';
    document.querySelector('#settings').contentDocument.querySelector('#save-name').click()`);
  await until(() => worker.evaluate(async () =>
    (await chrome.storage.local.get('profileName')).profileName === '侧栏测试'));
  await verifySettingsSizes(panel);
  await panel.evaluate(`document.querySelector('#settings-toggle').click()`);
}

async function verifySettingsSizes(panel) {
  for (const width of [320, 600]) {
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height: 720, deviceScaleFactor: 1, mobile: false });
    await until(() => panel.evaluate('innerWidth'), current => current === width);
    await screenshot(panel, `settings-${width}`);
    const bounds = await panel.evaluate(`(() => {
      const doc = document.querySelector('#settings').contentDocument;
      return { width: doc.documentElement.clientWidth, content: doc.documentElement.scrollWidth };
    })()`);
    assert.equal(bounds.width, bounds.content, 'settings must fit the panel without horizontal overflow');
  }
  await panel.send('Emulation.clearDeviceMetricsOverride');
}

async function verifyFrame(panel, chat, page) {
  await chat.evaluate(`document.querySelector('textarea').value = '保留这段草稿'; window.scrollTo(0, 600)`);
  await page.evaluate(() => window.scrollTo(0, 300));
  assert.equal(await chat.evaluate('scrollY'), 600);
  assert.equal(await page.evaluate(() => scrollY), 300);
  assert.equal(await chat.evaluate(`(() => {
    try { return Boolean(parent.chrome.runtime); } catch { return false; }
  })()`), false, 'hosted chat must not gain the local extension context');
  await panel.evaluate(`document.querySelector('#settings-toggle').click()`);
  await delay(100);
  await panel.evaluate(`document.querySelector('#settings-toggle').click()`);
  assert.equal(await chat.evaluate(`document.querySelector('textarea').value`), '保留这段草稿');
  assert.equal(await chat.evaluate('scrollY'), 600);
  assert.equal(await page.evaluate(() => scrollY), 300);
  await screenshot(panel, 'chat');
}

async function fill(chat, selector, value) {
  await chat.evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
}

async function clickText(chat, text) {
  const selector = `Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.includes(${JSON.stringify(text)}))`;
  await until(() => chat.evaluate(`Boolean(${selector})`));
  await chat.evaluate(`${selector}.click()`);
}

async function verifyMobileChat(panel, chat, page, worker) {
  await until(() => chat.evaluate(`Boolean(document.querySelector('input[type="password"]'))`));
  await fill(chat, 'input[type="email"]', 'mobile-test@example.test');
  await fill(chat, 'input[type="password"]', 'local-test');
  await clickText(chat, '登录并查看');
  await clickText(chat, '同意并登录');
  await until(() => chat.evaluate(`Boolean(document.querySelector('.app-shell'))`));
  await chat.evaluate(`Array.from(document.querySelectorAll('.mobile-tabbar *'))
    .find(item => item.textContent === '聊天')?.click()`);
  const composer = '[aria-label="聊天消息"]';
  try { await until(() => chat.evaluate(`Boolean(document.querySelector('${composer}'))`)); }
  catch (error) { console.log(await chat.evaluate('document.body.innerText')); throw error; }
  await fill(chat, composer, '侧边栏聊天测试');
  await until(() => chat.evaluate(`!document.querySelector('[aria-label="发送消息"]').disabled`));
  await chat.evaluate(`document.querySelector('[aria-label="发送消息"]').click()`);
  await until(() => chat.evaluate(`document.querySelector('${composer}').value === ''`));
  try { await until(() => chat.evaluate(`document.querySelectorAll('[data-message-id]').length > 0`)); }
  catch (error) {
    console.log(await chat.evaluate('document.body.innerText'));
    await screenshot(panel, 'chat-failure');
    throw error;
  }
  await fill(chat, composer, '切换设置后保留草稿');
  await page.evaluate(() => window.scrollTo(0, 300));
  await verifySettings(panel, worker);
  assert.equal(await chat.evaluate(`document.querySelector('${composer}').value`), '切换设置后保留草稿');
  assert.equal(await page.evaluate(() => scrollY), 300);
  await until(() => chat.evaluate(`!document.querySelector('.adm-toast-mask')`));
  await screenshot(panel, 'mobile-chat');
}

let context;
try {
  await prepare();
  context = await chromium.launchPersistentContext(path.join(root, 'profile'), {
    executablePath: process.env.CSW_CHROME_TEST_BROWSER ?? chromium.executablePath(),
    headless: false, viewport: null,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--window-size=1280,900'],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const page = context.pages()[0];
  await page.goto(fixtureUrl);
  const initialWidth = await page.evaluate(() => innerWidth);
  const originalStyle = await page.locator('body').getAttribute('style');
  assert.deepEqual(await worker.evaluate(() => chrome.sidePanel.getPanelBehavior()), { openPanelOnActionClick: true });
  const opener = await context.newPage();
  await opener.goto(worker.url().replace('background.js', 'test-open.html'));
  await opener.locator('#open').click();
  await page.bringToFront();
  await until(() => page.evaluate(() => innerWidth), width => width < initialWidth - 200);
  const cdp = await context.browser().newBrowserCDPSession();
  const panel = await targetFor(cdp, '/sidepanel.html');
  const chat = await targetFor(cdp, chatUrl, 'iframe');
  assert.equal(await page.locator('body').getAttribute('style'), originalStyle);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY), 'visible');
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight));
  assert.ok((await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] }))).length > 0);
  if (live) {
    await until(() => chat.evaluate(`Boolean(document.querySelector('input[type="password"]'))`));
    await screenshot(panel, 'hosted-mobile-login');
    console.log('Hosted Web login loaded in the real native side panel.');
  } else if (localWeb) await verifyMobileChat(panel, chat, page, worker);
  else await verifyFrame(panel, chat, page);
  if (!localWeb) await verifySettings(panel, worker);
  const chatFrame = await panel.evaluate(`document.querySelector('#chat').getBoundingClientRect().toJSON()`);
  assert.ok(chatFrame.width < 500 && chatFrame.height > 400);
  await opener.bringToFront();
  await opener.locator('#close').click();
  await page.bringToFront();
  await until(() => page.evaluate(() => innerWidth), width => width === initialWidth);
  // Chrome retains the documents during the closing animation; updater checks must become unblocked afterward.
  await until(() => worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })),
    contexts => contexts.length === 0);
  console.log(`Side panel opening, settings, frame isolation and independent scrolling passed. Screenshots: ${root}`);
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
}
